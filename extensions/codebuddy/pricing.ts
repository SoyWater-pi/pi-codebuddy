/**
 * Part 3b — pricing resolution: a faithful port of TT Switch's
 * usage_stats.rs model_pricing_candidates / find_model_pricing_row_at.
 *
 * Chain: candidate queue (namespace / version / date / effort / preset /
 * context / ioa suffix strips, aliases, claude dots→dashes), exact then
 * prefix match, effectiveFrom/Until time windows resolved at refresh time.
 * Unresolvable ids are FREE, matching the daemon's unpriced-model behavior.
 */

import type { PriceRow, PricingFeed } from "./feeds.js";

const ONE_M_CONTEXT_MARKER = "[1m]";

const NON_ANTHROPIC_MARKERS = [
	"abab", "ark-code", "arctic", "astron", "codex", "command-r", "deepseek", "doubao", "ernie", "gemini", "gemma",
	"glm", "gpt", "grok", "hermes", "hy3", "hunyuan", "jamba", "kimi", "lfm", "llama", "longcat", "mercury", "mimo",
	"minimax", "mistral", "mixtral", "moonshot", "nemotron", "nova-", "openai", "qianfan", "qwen", "seed-", "solar", "stepfun",
] as const;

const PRICING_ALIAS: Record<string, string> = {
	"gemini-3.1-pro": "gemini-3.1-pro-preview",
	"glm-5.2-internal": "glm-5.2",
	"kimi-k3": "k3",
};

const TT_SWITCH_PRESETS: Record<string, string> = {
	"ttsw-gpt-5.6-sol-272k": "gpt-5.6-sol",
	"ttsw-gpt-5.6-terra-272k": "gpt-5.6-terra",
	"ttsw-gpt-5.6-luna-272k": "gpt-5.6-luna",
};

/** clean_model_id_for_pricing: last path segment, before ':', '@'→'-', lowercase, [1m] marker trimmed. */
function cleanModelIdForPricing(modelId: string): string {
	let normalized = modelId
		.split("/")
		.pop()!
		.split(":")[0]!
		.trim()
		.replace(/@/g, "-")
		.toLowerCase();
	while (normalized.endsWith(ONE_M_CONTEXT_MARKER)) {
		normalized = normalized.slice(0, -ONE_M_CONTEXT_MARKER.length).trim();
	}
	return normalized;
}

const isPlaceholder = (id: string) => !id || id === "unknown" || id === "null" || id === "none";

/** strip_model_date_suffix: -YYYY-MM-DD (11 chars), else -YYYYMMDD (8), else -YYMMDD (6, valid month/day). */
function stripModelDateSuffix(id: string): string | null {
	if (id.length > 11) {
		const s = id.slice(-11);
		if (/^-\d{4}-\d{2}-\d{2}$/.test(s)) return id.slice(0, -11);
	}
	const m = /^(.*)-(\d+)$/.exec(id);
	if (m && m[1] && m[2]!.length === 8) return m[1]!;
	if (m && m[1] && m[2]!.length === 6) {
		const mo = Number(m[2]!.slice(2, 4));
		const dy = Number(m[2]!.slice(4, 6));
		if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) return m[1]!;
	}
	return null;
}

/** model_pricing_candidates: BFS over progressively-stripped ids (exact port). */
function pricingCandidates(modelId: string): string[] {
	const cleaned = cleanModelIdForPricing(modelId);
	if (isPlaceholder(cleaned)) return [];
	const out: string[] = [];
	const queue: string[] = [cleaned];
	while (queue.length > 0) {
		const c = queue.pop()!;
		if (!c || out.includes(c)) continue;
		out.push(c);
		// strip_known_model_namespace
		const cp = c.lastIndexOf("claude-");
		if (cp > 0) queue.push(c.slice(cp));
		for (const marker of ["openai.", "anthropic.", "google.", "moonshot.", "moonshotai.", "bedrock.", "global."]) {
			if (c.startsWith(marker)) queue.push(c.slice(marker.length));
		}
		// strip_claude_desktop_non_anthropic_prefix
		if (c.startsWith("claude-")) {
			const rest = c.slice(7);
			if (NON_ANTHROPIC_MARKERS.some((marker) => rest.startsWith(marker))) queue.push(rest);
		}
		// strip_provider_model_version_suffix (-vN)
		const vm = /^(.*)-v(\d+)$/.exec(c);
		if (vm && vm[1]) queue.push(vm[1]);
		// strip_model_date_suffix
		const strippedDate = stripModelDateSuffix(c);
		if (strippedDate) queue.push(strippedDate);
		// strip_reasoning_effort_suffix
		const em = /^(.*)-(minimal|low|medium|high|xhigh)$/.exec(c);
		if (em && em[1]) queue.push(em[1]);
		// strip_tt_switch_model_preset
		if (c in TT_SWITCH_PRESETS) queue.push(TT_SWITCH_PRESETS[c]!);
		// strip_context_window_suffix (-1m)
		if (c.endsWith("-1m") && c.length > 3) queue.push(c.slice(0, -3));
		// strip_tencent_pricing_suffix (-agent-ioa / -volc-ioa / -ioa)
		for (const s of ["-agent-ioa", "-volc-ioa", "-ioa"]) {
			if (c.endsWith(s) && c.length > s.length) {
				queue.push(c.slice(0, -s.length));
			break;
		}
		}
		// pricing_alias_candidate
		if (c in PRICING_ALIAS) queue.push(PRICING_ALIAS[c]!);
		// claude dots to dashes
		if (c.startsWith("claude-") && c.includes(".")) queue.push(c.replaceAll(".", "-"));
	}
	return out;
}

/** should_try_pricing_prefix_match. */
function allowsPrefixMatch(id: string): boolean {
	const dashCount = (id.match(/-/g) ?? []).length;
	if (id.startsWith("claude-")) return dashCount >= 3;
	if (["o1", "o3", "o4", "o5"].some((p) => id.startsWith(p))) return dashCount >= 1;
	return (
		["gpt-", "gemini-", "deepseek-", "qwen-", "glm-", "kimi-", "minimax-"].some((p) => id.startsWith(p)) &&
		dashCount >= 2
	);
}

/** Resolved price row at a point in time (null = no currently-effective row). */
export interface ResolvedPrice {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

function priceRowAt(prices: PriceRow[], nowMs: number): ResolvedPrice | null {
	const nowSec = nowMs / 1000;
	let best: { from: number; row: PriceRow } | null = null;
	for (const p of prices) {
		const from = p.effectiveFrom ? Date.parse(p.effectiveFrom) / 1000 : -Infinity;
		const until = p.effectiveUntil ? Date.parse(p.effectiveUntil) / 1000 : Infinity;
		if (from <= nowSec && nowSec < until && (!best || from > best.from)) best = { from, row: p };
	}
	if (!best) return null;
	const num = (v: string | number | undefined) => (v === undefined ? 0 : Number(v) || 0);
	return {
		input: num(best.row.inputPerUnit),
		output: num(best.row.outputPerUnit),
		cacheRead: num(best.row.cacheReadPerUnit),
		cacheWrite: num(best.row.cacheCreationPerUnit),
	};
}

/**
 * Build a resolvePrice(modelId) function over a verified pricing feed.
 * Semantics: exact candidate scan first, then prefix match (id followed by
 * '-%', shortest match first), each with time-window filtering.
 */
export function makePriceResolver(feed: PricingFeed): (modelId: string, nowMs?: number) => ResolvedPrice | null {
	const entries = new Map<string, PriceRow[]>();
	for (const e of feed.models ?? []) {
		if (!e?.modelId || !Array.isArray(e.prices)) continue;
		entries.set(e.modelId, e.prices);
	}
	const exactAt = (id: string, nowMs: number): ResolvedPrice | null => {
		const prices = entries.get(id);
		return prices ? priceRowAt(prices, nowMs) : null;
	};
	return (modelId: string, nowMs = Date.now()): ResolvedPrice | null => {
		const candidates = pricingCandidates(modelId);
		for (const c of candidates) {
			const r = exactAt(c, nowMs);
			if (r) return r;
		}
		// prefix family: id followed by '-', shortest first (SQL LIKE 'id-%' ORDER BY LENGTH)
		const ids = [...entries.keys()].sort((a, b) => a.length - b.length || a.localeCompare(b));
		for (const c of candidates) {
			if (!allowsPrefixMatch(c)) continue;
			const prefix = `${c}-`;
		for (const id of ids) {
				if (!id.startsWith(prefix)) continue;
			const r = exactAt(id, nowMs);
			if (r) return r;
		}
	}
		return null;
	};
}

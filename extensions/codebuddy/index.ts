/**
 * CodeBuddy — Tencent CodeBuddy as a native pi provider, plus quota tooling
 * and a live catalog refresh from TT Switch's signed feeds.
 *
 * Part 1: Direct provider — https://copilot.tencent.com/v2 (works off-intranet
 *   too). provider.ts holds the static baseline; refresh.ts replaces it with
 *   the live feed whenever it is newer.
 *
 * Part 2: /quota + footer bar — real CodeBuddy quota & spend from
 *   tokens.woa.com's Taihu API. taihu.ts.
 *
 * Part 3: Catalog refresh — signed TT Switch feeds → live model catalog.
 *   feeds.ts (fetch+verify), pricing.ts (price resolution), refresh.ts
 *   (projection + pi's two-phase refreshModels protocol).
 *
 * Everything below was derived from TT Switch's proven behavior and verified
 * live; each piece is either required or deliberately omitted:
 *
 * REQUIRED
 *  - compat flags (per-model!): maxTokensField max_tokens, no store/developer-
 *    role/reasoning_effort — otherwise pi sends fields the endpoint rejects or
 *    mangles. NOTE: pi's applyExtension() drops provider-level compat, so it
 *    must be attached to every model.
 *  - x-conversation-* headers: tokens.woa.com groups requests by
 *    x-conversation-request-id. Replay-verified contract (2026-09-10):
 *      * the id MUST be 32 lowercase hex (dashed UUIDs are silently discarded)
 *      * one id per task turn = one dashboard row per task
 *  - prompt_cache_key: the endpoint honors it (implicit cache, reported as
 *    cached_tokens which pi surfaces as cacheRead) but pi only sends it to
 *    api.openai.com, so we inject it here.
 *
 * VERIFIED NON-ISSUES (no code needed)
 *  - image input: works end-to-end on vision models via pi's @file syntax
 *  - context overflow: the endpoint accepts 400k+ tokens even past declared
 *    windows instead of erroring, so pi's threshold compaction is sufficient
 *
 * DELIBERATELY OMITTED (verified absent from TT Switch's working wire)
 *  - x-product: SaaS (not sent on pi/CodeBuddy traffic)
 *  - session affinity headers (session_id / x-client-request-id /
 *    x-session-affinity) — not sent by the daemon; per-request fresh ids
 *    would actively break grouping
 *  - tokens.woa.com-only extras not portable to a client extension:
 *    message-ID aggregation beyond per-task keys (Adaptive's tool-continuation
 *    inference), the hosted web-search bridge, negative-cache rollback
 */

import type { ExtensionAPI, ExtensionContext, ProviderConfig } from "@earendil-works/pi-coding-agent";
import { createHash, randomUUID } from "node:crypto";
import { resolveApiKey, buildModelConfigs, STATIC_CATALOG } from "./provider.js";
import { fetchQuotaSnapshot, fetchQuotaSummary, renderBar, resolveToken, FOOTER_TTL_MS, STATUS_KEY } from "./taihu.js";
import { refreshModels, LIVE_MODEL_IDS } from "./refresh.js";

/** 32 lowercase hex, no dashes — the only x-conversation-request-id shape the
 * backend accepts (replay-verified: it echoes hex32 back as the SSE id and
 * silently discards dashed UUIDs). */
const hex32 = () => randomUUID().replaceAll("-", "");

function stableUuid(seed: string): string {
	const h = createHash("sha256").update(seed).digest();
	h[6] = (h[6] & 0x0f) | 0x50;
	h[8] = (h[8] & 0x3f) | 0x80;
	const s = h.toString("hex");
	return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// pi clamps prompt_cache_key to 64 chars (openai-prompt-cache.js)
const PROMPT_CACHE_KEY_MAX = 64;
export default function (pi: ExtensionAPI) {
	const apiKey = resolveApiKey();
	const baseUrl = process.env.CODEBUDDY_BASE_URL ?? "https://copilot.tencent.com/v2";

	pi.registerProvider("codebuddy", {
		name: "CodeBuddy",
		baseUrl,
		api: "openai-completions",
		apiKey: apiKey ?? "MISSING_SET_CODEBUDDY_API_KEY",
		authHeader: true,
		// CodeBuddy CLI identity headers — the full set TT Switch's daemon sends
		// (sandboxed wire capture, byte-for-byte).
		headers: {
			"x-codebuddy-request": "1",
			"x-agent-intent": "craft",
			"x-agent-purpose": "conversation",
			"x-private-data": "false",
			"x-ide-type": "CLI",
			"x-ide-name": "CLI",
			"x-ide-version": "2.113.0",
			"user-agent": "CLI/2.113.0 CodeBuddy/2.113.0 CLI/2.113.0 CodeBuddy/2.113.0",
		},
		models: buildModelConfigs(STATIC_CATALOG),
		// pi's composer applies the returned list only when non-empty
		// (`if (refreshed)` in provider-composer.js) — undefined means "keep
		// currently-applied models", which our TTL/restore skips rely on. The
		// declared type is narrower than the runtime contract, hence the cast.
		refreshModels: refreshModels as ProviderConfig["refreshModels"],
	});

	// One grouping key per task turn: minted when the run starts, reused for
	// every model call within it (tools, retries, subagents). pi's turn_start
	// fires per model call — agent_start is the correct boundary.
	let turnKey: string | undefined;

	// Footer: bar line via setStatus, refreshed at session start and at most
	// once per minute thereafter (agent_start fires once per task run).
	// Fire-and-forget: never block the agent loop on the API.
	let lastFetch = 0;
	let inFlight: Promise<void> | null = null;
	let lastLine = "";

	const refreshFooter = (ctx: ExtensionContext): void => {
		if (ctx.mode !== "tui") return;
		if (inFlight || Date.now() - lastFetch < FOOTER_TTL_MS) return;
		const token = resolveToken();
		if (!token) return;
		inFlight = (async () => {
			try {
				const snap = await fetchQuotaSnapshot(token);
				if (snap?.total !== null && snap) lastLine = renderBar(snap.used, snap.total);
				// Powerline convention: statuses starting with "[" render ABOVE the
				// editor (notification class). A plain-text prefix routes it below the
				// editor alongside the other extension status details.
				if (lastLine) ctx.ui.setStatus(STATUS_KEY, `quota ${lastLine}`);
				lastFetch = Date.now();
			} catch {
				// network/API error: keep last known bar, retry after TTL
			} finally {
				inFlight = null;
			}
		})();
	};

	pi.on("session_start", (_event, ctx) => refreshFooter(ctx));

	pi.on("agent_start", (_event, ctx) => {
		// Random, never counter-derived: a process-global counter collides
		// across processes and the backend merges those runs into one row.
		turnKey = hex32();
		refreshFooter(ctx);
	});

	// Conversation identity headers. Unscoped (all providers), but harmless:
	// TT Switch's daemon route overwrites the set itself, others ignore it.
	pi.on("before_provider_headers", (event, ctx) => {
		const sessionId = ctx.sessionManager.getSessionId();
		if (!sessionId) return;
		event.headers["x-conversation-id"] = stableUuid(sessionId);
		event.headers["x-conversation-request-id"] = turnKey ?? hex32();
		// Daemon sends conv-msg == conv-req within a turn.
		event.headers["x-conversation-message-id"] = turnKey ?? hex32();
		event.headers["x-request-id"] = hex32();
	});

	// Stable session-scoped cache key — the endpoint honors prompt_cache_key
	// and reports implicit cache hits, which pi surfaces as cacheRead. The
	// hook event carries no provider identity, so scope by model id.
	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload as Record<string, unknown> | undefined;
		if (!payload || payload.prompt_cache_key) return;
		if (typeof payload.model !== "string" || !LIVE_MODEL_IDS.has(payload.model)) return;
		const sessionId = ctx.sessionManager.getSessionId();
		if (!sessionId) return;
		const chars = Array.from(sessionId);
		payload.prompt_cache_key =
			chars.length <= PROMPT_CACHE_KEY_MAX ? sessionId : chars.slice(0, PROMPT_CACHE_KEY_MAX).join("");
	});

	pi.registerCommand("quota", {
		description: "CodeBuddy quota & month-to-date spend (tokens.woa.com)",
		handler: async (_args, ctx) => {
			const token = resolveToken();
			if (!token) {
				ctx.ui.notify("No Taihu PAT found — set TAIHU_API_KEY or ~/.pi/agent/.taihu-token", "error");
				return;
			}
			try {
				const summary = await fetchQuotaSummary(token);
				ctx.ui.notify(summary, "info");
			} catch (e) {
				ctx.ui.notify(`quota fetch failed: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});
}

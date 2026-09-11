/**
 * Part 1 — the static baseline catalog and model-config assembly.
 *
 * The tables below are the embedded fallback (like TT Switch's compile-time
 * BUILTIN_TENCENT_MODEL_CATALOG envelope), regenerated from the signed
 * tencent_models.json feed rev 3 (updatedAt 2026-09-11). refresh.ts replaces
 * this with the live feed whenever it is newer.
 *
 * Costs are public USD list prices per million tokens, from TT Switch's
 * signed releases/model_pricing.json (payload rev 1, generatedAt 2026-08-27)
 * resolved through the daemon's pricing algorithm at generation time.
 * CodeBuddy's own costMultiplier is a unified-credit weight, NOT a monetary
 * multiplier (TT Switch bills these rows at multiplier 1.0 — usage_stats.rs
 * get_log_cost_multiplier). Unresolvable ids (hy*, echo, and new models
 * pending pricing) stay free.
 */

import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Auth — the CodeBuddy API key (from tencent.sso.copilot.tencent.com/profile/keys)
// ---------------------------------------------------------------------------

export function resolveApiKey(): string | undefined {
	if (process.env.CODEBUDDY_API_KEY) return process.env.CODEBUDDY_API_KEY;
	try {
		const key = readFileSync(join(homedir(), ".pi", "agent", ".cb-api-key"), "utf8").trim();
		return key || undefined;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Static baseline — regenerated from feed rev 3, 2026-09-11
// ---------------------------------------------------------------------------

export type ModelDef = {
	id: string;
	name: string;
	reasoning: boolean;
	input: string[];
	contextWindow: number;
	maxTokens: number;
	thinkingFormat?: string;
};
export const MODELS: ModelDef[] = [
	{ id: "glm-5.3-ioa", name: "GLM-5.3", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 48000, thinkingFormat: "zai" },
	{ id: "glm-5.3-flash-ioa", name: "GLM-5.3-Flash", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 32000, thinkingFormat: "zai" },
	{ id: "glm-5.2-ioa", name: "GLM-5.2", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 48000, thinkingFormat: "zai" },
	{ id: "glm-5.2-internal-ioa", name: "GLM-5.2-自部署", reasoning: true, input: ["text"], contextWindow: 200000, maxTokens: 48000, thinkingFormat: "zai" },
	{ id: "glm-5v-turbo-ioa", name: "GLM-5v-Turbo", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 38000, thinkingFormat: "zai" },
	{ id: "kimi-k3-ioa", name: "Kimi-K3", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 32000 },
	{ id: "kimi-k2.7-ioa", name: "Kimi-K2.7-Code", reasoning: true, input: ["text", "image"], contextWindow: 256000, maxTokens: 32000 },
	{ id: "kimi-k2.6-ioa", name: "Kimi-K2.6", reasoning: true, input: ["text", "image"], contextWindow: 256000, maxTokens: 32000 },
	{ id: "minimax-m3-ioa", name: "MiniMax-M3", reasoning: true, input: ["text", "image"], contextWindow: 512000, maxTokens: 48000 },
	{ id: "minimax-m2.7-ioa", name: "MiniMax-M2.7", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 48000 },
	{ id: "deepseek-v4-pro-ioa", name: "Deepseek-V4-Pro", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 50000 },
	{ id: "deepseek-v4.1-flash", name: "Deepseek-V4.1-Flash", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "deepseek-v4-flash-ioa", name: "DeepSeek-V4-Flash", reasoning: true, input: ["text"], contextWindow: 200000, maxTokens: 32768 },
	{ id: "hy3-ioa", name: "Hy3", reasoning: true, input: ["text", "image"], contextWindow: 192000, maxTokens: 64000 },
	{ id: "hy4-preview-ioa", name: "Hy4 preview", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 64000 },
	{ id: "hy4-dev", name: "Hy4 Dev", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 64000 },
	{ id: "echo", name: "Echo", reasoning: false, input: ["text"], contextWindow: 200000, maxTokens: 32768 },
	{ id: "claude-sonnet-5", name: "Claude-Sonnet-5", reasoning: true, input: ["text", "image"], contextWindow: 200000, maxTokens: 64000 },
	{ id: "claude-sonnet-5-1m", name: "Claude-Sonnet-5-1M", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "claude-sonnet-4.6", name: "Claude-Sonnet-4.6", reasoning: true, input: ["text", "image"], contextWindow: 176000, maxTokens: 24000 },
	{ id: "claude-sonnet-4.6-1m", name: "Claude-Sonnet-4.6-1M", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 24000 },
	{ id: "claude-opus-5", name: "Claude-Opus-5", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "claude-opus-4.8", name: "Claude-Opus-4.8", reasoning: true, input: ["text", "image"], contextWindow: 176000, maxTokens: 64000 },
	{ id: "claude-opus-4.8-1m", name: "Claude-Opus-4.8-1M", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "claude-opus-4.7", name: "Claude-Opus-4.7", reasoning: true, input: ["text", "image"], contextWindow: 176000, maxTokens: 64000 },
	{ id: "claude-opus-4.7-1m", name: "Claude-Opus-4.7-1M", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "claude-opus-4.6", name: "Claude-Opus-4.6", reasoning: true, input: ["text", "image"], contextWindow: 176000, maxTokens: 24000 },
	{ id: "claude-opus-4.6-1m", name: "Claude-Opus-4.6-1M", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 64000 },
	{ id: "gemini-3.1-pro", name: "Gemini-3.1-Pro", reasoning: true, input: ["text", "image"], contextWindow: 400000, maxTokens: 64000 },
	{ id: "gemini-3.5-flash", name: "Gemini-3.5-Flash", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 65536 },
	{ id: "gpt-5.6-sol", name: "GPT-5.6-Sol", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "gpt-5.6-terra", name: "GPT-5.6-Terra", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "gpt-5.6-luna", name: "GPT-5.6-Luna", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "gpt-5.5", name: "GPT-5.5", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
	{ id: "gpt-5.4", name: "GPT-5.4", reasoning: true, input: ["text", "image"], contextWindow: 272000, maxTokens: 128000 },
	{ id: "gpt-5.3-codex", name: "GPT-5.3-Codex", reasoning: true, input: ["text", "image"], contextWindow: 272000, maxTokens: 128000 },
	{ id: "gpt-6-astra", name: "GPT-6-Astra", reasoning: true, input: ["text", "image"], contextWindow: 1000000, maxTokens: 128000 },
];


export type Cost = { input: number; output: number; cacheRead: number; cacheWrite: number };
export const FREE: Cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export const COSTS: Record<string, Cost> = {
	"glm-5.3-ioa": { input: 1.1429, output: 4, cacheRead: 0.2857, cacheWrite: 0 },
	"glm-5.3-flash-ioa": { input: 0.1143, output: 0.4, cacheRead: 0.0329, cacheWrite: 0 },
	"glm-5.2-ioa": { input: 1.1429, output: 4, cacheRead: 0.2857, cacheWrite: 0 },
	"glm-5.2-internal-ioa": { input: 1.1429, output: 4, cacheRead: 0.2857, cacheWrite: 0 },
	"glm-5v-turbo-ioa": { input: 0.7143, output: 3.1429, cacheRead: 0.1714, cacheWrite: 0 },
	"kimi-k3-ioa": { input: 2.8571, output: 14.2857, cacheRead: 0.2857, cacheWrite: 0 },
	"kimi-k2.7-ioa": { input: 0.9286, output: 3.8571, cacheRead: 0.1857, cacheWrite: 0 },
	"kimi-k2.6-ioa": { input: 0.9286, output: 3.8571, cacheRead: 0.1571, cacheWrite: 0 },
	"minimax-m3-ioa": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
	"minimax-m2.7-ioa": { input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0 },
	"deepseek-v4-pro-ioa": { input: 0.4286, output: 0.8571, cacheRead: 0.0036, cacheWrite: 0 },
	"deepseek-v4.1-flash": FREE,
	"deepseek-v4-flash-ioa": { input: 0.1429, output: 0.2857, cacheRead: 0.0029, cacheWrite: 0 },
	"hy3-ioa": FREE,
	"hy4-preview-ioa": FREE,
	"hy4-dev": FREE,
	echo: FREE,
	"claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-sonnet-5-1m": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-sonnet-4.6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-sonnet-4.6-1m": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
	"claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.8-1m": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.7": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.7-1m": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.6": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"claude-opus-4.6-1m": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
	"gemini-3.1-pro": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 0 },
	"gemini-3.5-flash": { input: 1.5, output: 9, cacheRead: 0.15, cacheWrite: 0 },
	"gpt-5.6-sol": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
	"gpt-5.6-terra": { input: 2, output: 12, cacheRead: 0.2, cacheWrite: 2.5 },
	"gpt-5.6-luna": { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
	"gpt-5.5": { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
	"gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
	"gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175, cacheWrite: 0 },
	"gpt-6-astra": FREE,
};

// ---------------------------------------------------------------------------
// Model config assembly — shared by static registration, refresh output, and
// the persisted store entry.
// ---------------------------------------------------------------------------

export const PROVIDER_COMPAT = {
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsReasoningEffort: false,
	maxTokensField: "max_tokens" as const,
};

export type CatalogEntry = ModelDef & { cost: Cost };

/** The embedded baseline catalog: static defs with their table costs. */
export const STATIC_CATALOG: CatalogEntry[] = MODELS.map((m) => ({ ...m, cost: COSTS[m.id] ?? FREE }));
export function buildModelConfigs(defs: readonly CatalogEntry[]): ProviderModelConfig[] {
	return defs.map((d) => ({
		id: d.id,
		name: d.name,
		reasoning: d.reasoning,
		input: d.input as ("text" | "image")[],
		contextWindow: d.contextWindow,
		maxTokens: d.maxTokens,
		cost: { ...d.cost },
		compat: { ...PROVIDER_COMPAT, ...(d.thinkingFormat ? { thinkingFormat: d.thinkingFormat as "zai" } : {}) },
	}));
}


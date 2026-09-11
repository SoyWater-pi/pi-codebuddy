/**
 * Part 3c — catalog refresh: feed projection, store restore, and pi's
 * two-phase refreshModels protocol.
 *
 * Chain (mirroring TT Switch's own import order):
 *   1. restore: models-store.json snapshot (persisted by a prior refresh)
 *   2. network: fetch + HMAC-verify TT Switch's signed catalog feeds
 *   3. baseline: static MODELS/COSTS tables (embedded fallback)
 *
 * Projection uses TT Switch's daemon semantics (pi_catalog.rs / public_model):
 *   contextWindow = effectiveMaxInputTokens || maxInputTokens, maxTokens =
 *   maxOutputTokens, input adds "image" when supportsImages, name = displayName.
 *   Compat is our direct-endpoint set (NOT the daemon's locked_compat — that
 *   assumes the daemon proxy transforms traffic): supportsReasoningEffort false
 *   so reasoning:true adds no request fields; thinkingFormat zai on glm- only.
 *
 * Preservation (TT Switch member-frozen philosophy): models in our static
 *   list but absent from the feed are KEPT with their static definitions
 *   (currently echo, deepseek-v4-flash-ioa) — a feed that stops listing a
 *   model never silently drops it.
 */

import type { ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import { FREE, COSTS, STATIC_CATALOG, buildModelConfigs, type CatalogEntry } from "./provider.js";
import { fetchVerifiedFeed, TENCENT_FEED_KEY, PRICING_FEED_KEY, type TencentFeed, type PricingFeed } from "./feeds.js";
import { makePriceResolver, type ResolvedPrice } from "./pricing.js";

const REFRESH_TTL_MS = 4 * 60 * 60 * 1000; // parity with pi's remote-catalog 4h
/** Baseline date for the store freshness check: feed rev 3, 2026-09-11. */
const BASELINE_UPDATED_AT = Date.parse("2026-09-11T02:24:03.000Z");

/**
 * Build the refreshed catalog: feed models projected with daemon semantics,
 * static-only models preserved, GLM keeps thinkingFormat zai.
 * An empty/absent feed yields an empty list — the caller treats that as
 * "keep baseline" (daemon policy: empty catalog is an error).
 */
function projectCatalog(feed: TencentFeed, resolvePrice: (id: string) => ResolvedPrice | null): CatalogEntry[] {
	const rows = feed.models ?? [];
	if (rows.length === 0) return [];
	const feedIds = new Set(rows.map((r) => r.id));
	const entries: CatalogEntry[] = [];
	for (const r of rows) {
		const ctx = r.effectiveMaxInputTokens || r.maxInputTokens || 0;
		if (!r.id || ctx <= 0 || !r.maxOutputTokens) continue; // skip malformed rows
		const price = resolvePrice(r.id);
		entries.push({
			id: r.id,
			name: r.displayName || r.id,
			reasoning: r.supportsReasoning === true,
			input: r.supportsImages ? ["text", "image"] : ["text"],
			contextWindow: ctx,
			maxTokens: r.maxOutputTokens,
			...(r.id.startsWith("glm-") ? { thinkingFormat: "zai" } : {}),
			cost: price ? { ...price } : { ...FREE },
		});
	}
	// Preservation: static-only models keep their embedded definitions.
	for (const def of STATIC_CATALOG) {
		if (!feedIds.has(def.id)) entries.push({ ...def, cost: { ...def.cost } });
	}
	return entries;
}
function modelToEntry(m: Record<string, unknown>): CatalogEntry | null {
	const cost = m.cost as { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | undefined;
	if (
		typeof m.id !== "string" || typeof m.name !== "string" || typeof m.reasoning !== "boolean" ||
		!Array.isArray(m.input) || typeof m.contextWindow !== "number" || typeof m.maxTokens !== "number" ||
		!cost || typeof cost.input !== "number"
	) {
		return null;
	}
	const compat = m.compat as { thinkingFormat?: string } | undefined;
	return {
		id: m.id,
		name: m.name,
		reasoning: m.reasoning,
		input: m.input as string[],
		contextWindow: m.contextWindow,
		maxTokens: m.maxTokens,
		...(compat?.thinkingFormat ? { thinkingFormat: compat.thinkingFormat } : {}),
		cost: {
			input: cost.input ?? 0,
			output: cost.output ?? 0,
			cacheRead: cost.cacheRead ?? 0,
			cacheWrite: cost.cacheWrite ?? 0,
		},
	};
}

/** Restore-phase validation of a stored entry (full Model objects + freshness). */
function storedToEntries(stored: { models?: unknown; lastModified?: number } | undefined): CatalogEntry[] | null {
	const models = stored?.models;
	if (!Array.isArray(models) || models.length === 0) return null;
	// Freshness: ignore a stored catalog that is not newer than the embedded
	// baseline (mirrors pi's remote-catalog localGeneratedAt comparison).
	if (stored?.lastModified !== undefined && stored.lastModified <= BASELINE_UPDATED_AT) return null;
	const entries: CatalogEntry[] = [];
	for (const m of models) {
		const entry = m && typeof m === "object" ? modelToEntry(m as Record<string, unknown>) : null;
		if (!entry) return null;
		entries.push(entry);
	}
	return entries;
}
// --- refreshModels: pi's two-phase protocol --------------------------------

/**
 * When the pricing feed is retired (404/501), synthesize a feed from the
 * static COSTS table — the daemon likewise keeps its DB pricing rows when a
 * feed disappears, instead of dropping cost tracking entirely.
 */
function pricingFallback(pricing: unknown): PricingFeed {
	if (pricing !== null) return pricing as PricingFeed;
	return {
		models: Object.entries(COSTS).map(([modelId, cost]) => ({
			modelId,
			prices: [
				{
					inputPerUnit: String(cost.input),
					outputPerUnit: String(cost.output),
					cacheReadPerUnit: String(cost.cacheRead),
					cacheCreationPerUnit: String(cost.cacheWrite),
				},
			],
		})),
	};
}

/**
 * Live model-id set: static baseline ∪ everything a refresh restored or
 * fetched. The prompt_cache_key hook (inside the factory below) is unscoped
 * across providers, so it needs the provider's true current id set; the
 * registry snapshot at session_start predates the first refresh.
 */
export const LIVE_MODEL_IDS = new Set(STATIC_CATALOG.map((m) => m.id));

/**
 * Phase 1 (allowNetwork false): restore the persisted snapshot.
 * Phase 2 (allowNetwork true): TTL-throttled fetch + verify + publish.
 * Returning undefined leaves the currently-applied models untouched.
 */export async function refreshModels(
	context: Parameters<NonNullable<ProviderConfig["refreshModels"]>>[0],
): Promise<ProviderModelConfig[] | undefined> {
	// Phase 1 — restore from models-store.json.
	if (!context.allowNetwork) {
		const restored = storedToEntries(context.stored);
		if (!restored) return;
		LIVE_MODEL_IDS.clear();
		for (const e of restored) LIVE_MODEL_IDS.add(e.id);
		return buildModelConfigs(restored);
	}
	if (context.signal.aborted) return;

	// Phase 2 — TTL check (bypassed by force, e.g. pi's model-selector refresh
	// passes force when the user explicitly re-opens the selector).
	const stored = context.stored;
	if (
		!context.force &&
		stored?.checkedAt !== undefined &&
		Date.now() - stored.checkedAt < REFRESH_TTL_MS
	) {
		return;
	}

	// Fetch both feeds in parallel; either may be null (404/501 = retired feed).
	const [tencent, pricing] = await Promise.all([
		fetchVerifiedFeed("tencent_models.json", TENCENT_FEED_KEY, true, context.signal),
		fetchVerifiedFeed("model_pricing.json", PRICING_FEED_KEY, false, context.signal),
	]);
	if (context.signal.aborted) return;
	if (tencent === null && pricing === null) {
		// Both feeds retired: delete the stale store entry, keep the baseline.
		await context.publish({ persist: null });
		return;
	}

	// Empty catalog → keep everything as-is (daemon policy: an empty catalog
	// is an error, not a signal to wipe models or the stored snapshot).
	const entries =
		tencent === null ? [] : projectCatalog(tencent as TencentFeed, makePriceResolver(pricingFallback(pricing)));
	if (entries.length === 0) return;

	const checkedAt = Date.now();
	const lastModified = Date.parse((tencent as TencentFeed).updatedAt ?? "") || checkedAt;

	// Publish the refreshed catalog both ways: persist full Model objects for
	// cross-session restore, and return the list for this session's application.
	LIVE_MODEL_IDS.clear();
	for (const e of entries) LIVE_MODEL_IDS.add(e.id);
	await context.publish({
		persist: {
			models: buildModelConfigs(entries) as never, // Model<"openai-completions"> shape after applyExtension stamping
		checkedAt,
		lastModified,
	},
	});
	return buildModelConfigs(entries);
}

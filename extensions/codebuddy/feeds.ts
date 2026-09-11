/**
 * Part 3a — signed TT Switch catalog feeds: fetch + HMAC verification.
 *
 * Feeds (both verified against the wire):
 *   - tencent_models.json  — model catalog, key "tt-switch/tencent-codebuddy-model-catalog/v1",
 *     HMAC-SHA256 over the base64 payload STRING (utf8)
 *   - model_pricing.json   — USD/Mtok prices, key "tt-switch/public-model-pricing-catalog/v1",
 *     HMAC-SHA256 over the DECODED payload bytes
 *
 * The signature asymmetry is real: tencent_models.json signs the base64
 * string bytes, model_pricing.json signs the decoded payload bytes (verified
 * in TT Switch source: sign_tencent_catalog_payload vs verify_slice).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const FEED_BASE_URL = "https://cnb.woa.com/tt-switch/tt-switch/-/git/raw/master/releases/";
export const TENCENT_FEED_KEY = "tt-switch/tencent-codebuddy-model-catalog/v1";
export const PRICING_FEED_KEY = "tt-switch/public-model-pricing-catalog/v1";

export interface SignedEnvelope {
	schemaVersion: number;
	algorithm: string;
	payload: string;
	signature: string;
}

export interface TencentModelRow {
	id: string;
	displayName?: string;
	maxInputTokens?: number;
	effectiveMaxInputTokens?: number;
	maxOutputTokens?: number;
	supportsReasoning?: boolean;
	supportsImages?: boolean;
}

export interface TencentFeed {
	revision?: number;
	updatedAt?: string;
	models?: TencentModelRow[];
}

export interface PriceRow {
	inputPerUnit?: string | number;
	outputPerUnit?: string | number;
	cacheReadPerUnit?: string | number;
	cacheCreationPerUnit?: string | number;
	effectiveFrom?: string;
	effectiveUntil?: string;
}

export interface PricingEntry {
	modelId?: string;
	prices?: PriceRow[];
}

export interface PricingFeed {
	models?: PricingEntry[];
}

/**
 * Fetch + verify + decode one signed feed. Returns null on 404/501 (endpoint
 * retired the feed — treat as no catalog rather than an error). Any signature
 * or schema mismatch throws: an unverifiable catalog must never be applied.
 */
export async function fetchVerifiedFeed(
	file: string,
	signingKey: string,
	overString: boolean,
	signal: AbortSignal,
): Promise<unknown> {
	const res = await fetch(`${FEED_BASE_URL}${file}`, { signal });
	if (res.status === 404 || res.status === 501) return null;
	if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
	const env = (await res.json()) as SignedEnvelope;
	if (env.schemaVersion !== 1) throw new Error(`${file}: unsupported schemaVersion ${env.schemaVersion}`);
	if (env.algorithm !== "HMAC-SHA256+BASE64-PAYLOAD") throw new Error(`${file}: unsupported algorithm ${env.algorithm}`);
	const mac = overString
		? createHmac("sha256", signingKey).update(env.payload, "utf8").digest()
		: createHmac("sha256", signingKey).update(Buffer.from(env.payload, "base64")).digest();
	// base64 lengths are equal here by construction (same digest); timingSafeEqual
	// guards the comparison against timing side channels.
	if (
		mac.toString("base64").length !== env.signature.length ||
		!timingSafeEqual(Buffer.from(mac.toString("base64")), Buffer.from(env.signature))
	) {
		throw new Error(`${file}: signature verification failed`);
	}
	return JSON.parse(Buffer.from(env.payload, "base64").toString("utf8"));
}

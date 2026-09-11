/**
 * Part 2 — Taihu quota & spend (tokens.woa.com).
 *
 * Shows actual ¥ quota burn (with CodeBuddy's per-model costMultiplier applied
 * server-side), as opposed to pi's session footer which shows list-price USD.
 *
 * Token source: $TAIHU_API_KEY, else ~/.pi/agent/.taihu-token.
 * Get a PAT at https://tai.it.woa.com/user/pat and authorize the app
 * 「Token看板」 (app id: token). API docs: openapi.token.woa.com.
 *
 * Handles the API's special "quota": "-" state (unlimited/disabled/invisible
 * window) — never numeric on "-", per the official FAQ.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TAIHU_BASE_URL = "https://openapi.token.woa.com";
const BAR_WIDTH = 24;
export const FOOTER_TTL_MS = 60_000; // API is 3s-cached + rate-limited; don't poll harder than 1/min
export const STATUS_KEY = "taihu-quota";

interface ApiResp<T> {
	code: number;
	message: string;
	data: T | null;
}

async function taihuGet(path: string, token: string): Promise<ApiResp<Record<string, unknown>>> {
	const res = await fetch(`${TAIHU_BASE_URL}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	return (await res.json()) as ApiResp<Record<string, unknown>>;
}

const fmtMoney = (v: string) => {
	const n = Number(v);
	return Number.isFinite(n)
		? `¥${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
		: v;
};

export interface QuotaSnapshot {
	used: number;
	/** null when quota is "-", not configured, or invalid — nothing to bar against. */
	total: number | null;
}

/** Numbers-only fetch; null when usage is unavailable (quota alone can't render a bar). */
export async function fetchQuotaSnapshot(token: string): Promise<QuotaSnapshot | null> {
	const [q, u] = await Promise.all([taihuGet("/api/v1/quota/total", token), taihuGet("/api/v1/usage/total", token)]);
	if (u.code !== 0 || !u.data) return null;
	const used = Number(u.data.cost ?? "0");
	if (!Number.isFinite(used)) return null;
	let total: number | null = null;
	if (q.code === 0 && q.data) {
		const raw = String(q.data.quota ?? "-");
		if (raw !== "-") {
			const n = Number(raw);
			if (Number.isFinite(n) && n > 0) total = n;
		}
	}
	return { used, total };
}

/** Seamless full-cell bar (integer cells only — no sub-cell blocks, no gaps). */
export function renderBar(used: number, total: number, width = BAR_WIDTH): string {
	if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return "";
	const ratio = Math.max(0, used / total);
	const full = Math.min(width, Math.max(0, Math.round(Math.min(ratio, 1) * width)));
	const bar = "█".repeat(full) + "░".repeat(width - full);
	const flag = ratio > 1 ? " ⚠ over quota" : "";
	return `[${bar}] (${fmtMoney(String(used))}/${fmtMoney(String(total))}) ${(ratio * 100).toFixed(1)}% used${flag}`;
}

export async function fetchQuotaSummary(token: string): Promise<string> {
	const [q, u] = await Promise.all([taihuGet("/api/v1/quota/total", token), taihuGet("/api/v1/usage/total", token)]);

	const lines: string[] = [];
	if (u.code !== 0 || !u.data) {
		lines.push(`usage: error ${u.code} — ${u.message}`);
	} else {
		lines.push(`month used: ${fmtMoney(String(u.data.cost ?? "0"))}`);
	}

	if (q.code === 200004) {
		lines.push("quota: not configured (404)");
		return lines.join("\n");
	}
	if (q.code !== 0 || !q.data) {
		lines.push(`quota: error ${q.code} — ${q.message}`);
		return lines.join("\n");
	}

	const raw = String(q.data.quota ?? "-");
	if (raw === "-") {
		// Success responses: message "ok" = unlimited/disabled; otherwise an
		// invisible-window reason. Never treat "-" as a number.
		lines.push(`quota: ${q.message === "ok" ? "— (unlimited or not visible)" : `temporarily invisible (${q.message})`}`);
		return lines.join("\n");
	}

	const used = u.code === 0 && u.data ? Number(u.data.cost ?? "0") : NaN;
	const total = Number(raw);
	lines.push(`month quota: ${fmtMoney(raw)}`);
	const bar = renderBar(used, total);
	if (bar) {
		lines.push(bar);
		lines.push(`remaining: ${fmtMoney(String(total - used))}`);
	}
	return lines.join("\n");
}

export function resolveToken(): string {
	if (process.env.TAIHU_API_KEY) return process.env.TAIHU_API_KEY.trim();
	try {
		return readFileSync(join(homedir(), ".pi", "agent", ".taihu-token"), "utf8").trim();
	} catch {
		return "";
	}
}

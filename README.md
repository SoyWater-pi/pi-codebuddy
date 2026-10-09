# pi-codebuddy

Tencent CodeBuddy as a native [pi coding agent](https://github.com/earendil-works/pi-coding-agent) provider — the direct `https://copilot.tencent.com/v2` endpoint, a ¥ quota footer, and a live model-catalog refresh from TT Switch's signed feeds.

> **Heads-up:** the three parts have different network requirements:
>
> | Part | Endpoint | Off-intranet? |
> |---|---|---|
> | Provider (chat, models) | `copilot.tencent.com/v2` | **Yes** — works anywhere |
> | `/quota` + ¥ footer | `openapi.token.woa.com` | No — intranet only |
> | Catalog refresh | `cnb.woa.com` | No — intranet only |
>
> Off-network you still get working chat and the embedded model baseline; you lose the quota bar and live price/model updates. Those degrade quietly rather than erroring.

## What you get

- **`codebuddy` provider** — all CodeBuddy models (GLM, Kimi, MiniMax, DeepSeek, Hunyuan, Claude, Gemini, GPT) over the direct `/v2` OpenAI-compatible endpoint, with the wire quirks TT Switch's daemon uses baked in:
  - `x-conversation-*` headers minted per task turn (hex32) so tokens.woa.com shows one dashboard row per task
  - `prompt_cache_key` injection → implicit-cache hits surface as `cacheRead` in pi's usage footer
  - per-model compat: `max_tokens` field, no `store`/developer-role/`reasoning_effort`, `thinkingFormat: zai` on GLM
  - USD/Mtok cost metadata so pi's session footer prices turns correctly
- **`/quota` command + footer bar** — real ¥ quota and month-to-date spend from tokens.woa.com's Taihu API (needs a PAT from https://tai.it.woa.com/user/pat authorized for 「Token看板」)
- **Live catalog refresh** — pi's `refreshModels` protocol backed by TT Switch's HMAC-signed `tencent_models.json` + `model_pricing.json` feeds:
  - restore from `models-store.json` at startup, 4h-TTL background fetch otherwise
  - time-windowed pricing (price changes resolve to the currently-effective row)
  - preservation: models the feed drops but the extension knows (e.g. `echo`, `deepseek-v4-flash-ioa`) are never silently removed

## Install

```bash
pi install git:github.com/Soywater-pi/pi-codebuddy
```

Or try it without installing:

```bash
pi -e git:github.com/Soywater-pi/pi-codebuddy
```

## Setup

Credentials are per-machine and never belong in a repo. Two independent systems are involved, and the provider needs the first.

### API key (required)

Without it the provider still registers, but passes the literal string `MISSING_SET_CODEBUDDY_API_KEY` — so you get an auth error on the first turn rather than at startup.

Get a key from <https://tencent.sso.copilot.tencent.com/profile/keys>, then:

```bash
printf '%s' 'your-key' > ~/.pi/agent/.cb-api-key
chmod 600 ~/.pi/agent/.cb-api-key
# or
export CODEBUDDY_API_KEY="your-key"
```

Use `printf '%s'`, not `echo -n`: `-n` is not portable and some shells write a literal `-n`, silently corrupting the key. The `chmod` matters because this is a live credential.

The env var wins over the file (`provider.ts:28`).

Then in `~/.pi/agent/settings.json`:

```json
{
  "defaultProvider": "codebuddy",
  "defaultModel": "glm-5.3-ioa"
}
```

### Quota token (optional, for /quota + footer)

Only needed for `/quota` and the ¥ footer bar. Create a PAT at <https://tai.it.woa.com/user/pat>, authorized for 「Token看板」:

```bash
printf '%s' 'your-pat' > ~/.pi/agent/.taihu-token
chmod 600 ~/.pi/agent/.taihu-token
# or
export TAIHU_API_KEY="your-pat"
```

If missing, `/quota` reports `No Taihu PAT found — set TAIHU_API_KEY or ~/.pi/agent/.taihu-token`. A PAT that exists but lacks 「Token看板」 authorization fails at the API call instead, surfacing the HTTP error.

### Credential path gotcha

Both file paths are hardcoded to `~/.pi/agent/` (`join(homedir(), ".pi", "agent", ...)`) and do **not** honour `PI_CODING_AGENT_DIR`. If you relocate the agent dir — for example on NixOS — the config follows but these credential files do not. Put them in `~/.pi/agent/` regardless, or use the env vars.

### Environment overrides

| Variable | Purpose |
|---|---|
| `CODEBUDDY_API_KEY` | API key (preferred over the file) |
| `CODEBUDDY_BASE_URL` | Override the endpoint (default `https://copilot.tencent.com/v2`) |
| `TAIHU_API_KEY` | Taihu PAT for the quota bar |

## How the catalog refresh works

pi triggers `refreshModels` at interactive startup, when the model selector opens, and on failed exact-match model search. The extension implements both phases:

1. **Restore** — `models-store.json` snapshot from a prior refresh is applied instantly (works offline, honors `PI_OFFLINE`)
2. **Network** (4h TTL, background) — both signed feeds are fetched and HMAC-SHA256-verified in parallel. Tampered or unverifiable feeds throw and leave the current models untouched. Catalog values win for metadata; extension-only models are preserved; unresolved prices fall back to the embedded table, then free.

Deleting the `codebuddy` entry from `~/.pi/agent/models-store.json` resets to the embedded baseline.

## Repository layout

```
extensions/codebuddy/
├── index.ts     — entry: provider registration, wire hooks, /quota command
├── provider.ts  — static model/cost baseline + config assembly
├── taihu.ts     — Taihu quota API + bar renderer
├── feeds.ts     — signed-feed fetch + HMAC verification
├── pricing.ts   — pricing resolution (usage_stats.rs port)
└── refresh.ts   — feed projection + two-phase refreshModels protocol
```

## License

MIT

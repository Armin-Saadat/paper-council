# Paper Council

An MCP server and companion skill for saved, multi-model paper-writing discussions. Choose a coordinator from the participants; everyone drafts and critiques peers, including the coordinator. Codex operates the tools and files. Gemini uses the Antigravity CLI, Grok uses its official CLI, and Claude uses the Anthropic Messages API. CLI providers use their existing logins; Claude uses a private local API key. There is no automatic provider fallback.

## Use from Codex

Reload Codex's MCP connection after an update (or restart Codex), then ask:

> Use paper-council to develop this paper with Gemini and Grok. Start with independent analyses, let them critique one another, and integrate the result while preserving unresolved disagreements.

Codex creates a session with the brief, source excerpts, and draft, then requests independent drafts before sharing any participant’s candidate. Each agent gets the same pre-round snapshot. The next round includes all selected participants’ responses. Codex integrates the draft with an expected revision number, preventing stale overwrites. No separate Codex subprocess is needed: the current Codex chat operates the workflow and contributes scientifically when included in the participant list.

Tools: create_session, post_message, run_round, ask_model, get_result, get_session, save_draft, list_sessions, list_discussions, cancel_job. Async calls return an ID; poll get_result. get_session pages history with next_offset. At most three external agents run per server; one round at a time per session. Failed/partial rounds are explicit. cancel_job controls jobs in the current server. A restart interrupts running jobs; a later operation releases locks owned by dead processes. Multiple server instances may each consume quota.

## Files and configuration

- config.json sets CLI paths, model IDs, and Claude API settings. Claude defaults to `claude-opus-5-5`, `max` effort, and a 16,384 output-token ceiling. Its key file is `state/claude-api-key`; never put the key itself in config.json. Defaults: Gemini `gemini-4-argon-high`, Grok `grok-4.7` with `xhigh` reasoning. Model IDs must be available through the respective login; provider routing is not independently attested.
- state/sessions contains briefs, source excerpts, discussions, current drafts, and archived draft revisions. state also contains jobs and exact submitted requests. These are private local files and ignored by git, but supplied text is sent to the chosen provider.
- CLI credentials remain in their official user configuration. Claude reads only its configured private key file (mode 600); its key is never passed to Gemini/Grok. Environment API credentials are removed before spawning any participant.
- Run `bin/agy` for Gemini login, or login.command for Grok. launch.command starts the MCP server. Moving the folder requires updating Codex's server registration and skill symlink.

Prompts are capped at 100,000 characters; the full round packet at 240,000. Overflow fails before calling an agent rather than dropping history. Responses are bounded to 2 MB and processes to five minutes. There is no dollar spending cap; provider account quota/overage settings still apply. No automatic rounds, retries, or credit purchases.

For Claude, use `ask_model(provider="claude", ...)`, or select `participants=["gemini","grok","claude"]` in `run_round`. `claude_model` overrides the round model. For compatibility, an omitted participants list still selects Gemini/Grok only. Claude API usage incurs token charges; successful jobs record usage and the API-reported model. The output ceiling is not a dollar cap. No tools are sent to Claude, redirects are rejected, and HTTP errors are sanitized. Cancellation terminates the local request but cannot guarantee that the provider stops billing an already accepted request.

## Scope and limitations

Agents return text. Codex verifies sources and edits the manuscript. Grok's tool flags disable tools. Gemini follows the reference repository's stdin-based headless approach, disables slash expansion, and is instructed not to call tools or create artifacts. It retains normal headless approval behavior; no permission bypass. This is not OS-level isolation, and user CLI configuration/hooks may still load. Runs use dedicated job directories rather than the research repository.

Google describes Antigravity CLI wrappers in third-party agents as unsupported under consumer plans: https://antigravity.google/docs/faq . This integration does not extract CLI credentials or proxy CLI authentication into API access.

Reference inspected: https://github.com/aboots/codex-cursor-review/blob/3ad487756f3a06e52c03a9c93119ffec8267d32f/review.py . This implementation adapts the CLI invocation pattern to paper sessions; it does not install that repository's policies or Council package.

## Validation

Run `node test.mjs` with Node.js 22 or later. Integration tests use fake CLI processes and the actual MCP SDK client to verify history, identical evidence snapshots, revisions, locks, cancellation, partial failure, and API-key isolation. Run `node test-claude.mjs` for mocked API tests. Live tests use subscription quota and Claude API tokens.

## Repository layout and local installation

This repository contains the general MCP server, provider adapters, tests, and `skills/paper-council/SKILL.md`. Project-specific writing skills are installed separately. The skill supports a coordinator selected from the participants; every selected participant drafts and critiques peers. Codex operates tools and files. The default coordinator is Gemini, with all four participants selected.

Local-only directories are excluded from Git: `state/` (including the Claude key and saved discussions), `runtime/`, `bin/`, and `node_modules/`. A clone does not include credentials or working provider binaries.

To install: run `npm ci`; install the official Antigravity CLI at `bin/agy` and Grok CLI at `runtime/grok` (or set their paths in config.json); authenticate each CLI separately. The bundled launcher expects Node at `runtime/node-v22.23.4-darwin-arm64/bin/node`; alternatively launch `node /absolute/path/to/server.mjs` with a compatible Node installation. Configure the MCP server to use that launcher and link the general skill into your skills directory. For Claude, create `state/` privately and save only the API key in `state/claude-api-key` with mode 600. Never commit credentials.

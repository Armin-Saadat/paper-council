---
name: paper-council
description: Run configurable paper councils with a coordinator chosen from the participants. Every participant, including the coordinator, drafts and critiques peers; Codex operates the tools and files.
---
The selected coordinator leads the scientific discussion. Codex operates the tools and files in the current chat, regardless of which participant coordinates. Gemini and Grok are CLI participants authenticated through their existing accounts. Claude is an API participant using a private local key file. Claude API calls incur token charges. Gemini defaults to the model in config.json (currently gemini-4-argon-high); Grok to grok-4.7 with xhigh reasoning. Claude defaults to claude-opus-5-5 with max effort and a 16,384-token output ceiling. Explicit model overrides are allowed; report unavailability instead of silently substituting providers or models. Requested models are not independent proof of provider routing.

Use create_session with the paper brief, evidence/source excerpts, and initial draft. Keep the returned session ID. Find existing work with list_sessions and get_session; page through history using next_offset. No files are automatically attached. Never include secrets or unrelated private data in shared material.

For independent drafts, prepare Codex's candidate privately if Codex is selected, and run_round for the selected external participants on identical evidence before sharing any candidates. Do not post Codex's candidate first: shared session history would expose it to the others. Then share every candidate for mutual critique. The selected coordinator also drafts independently and critiques peers; afterward it synthesizes revisions. If the coordinator is external, call ask_model with its provider and session_id for the actual synthesis; do not substitute Codex's synthesis or invent the coordinator's decisions.

Poll get_result at reasonable intervals (usually 15–30 seconds). Successful replies are attributed and appended to history; wait for the full round before starting the next phase. Partial, failed, cancelled, or interrupted jobs are not completed debate or agreement. Preserve useful replies and report failures. cancel_job stops a running round; do not repeat billable calls automatically.

Use ask_model to target one participant or ask a standalone question. With session_id it receives the shared brief, sources, manuscript, and history; without it the prompt must be self-contained. post_message records Codex/user contributions only. Do not misattribute external agent replies.

For a paper-writing task, a useful default is independent drafts from all selected participants, mutual critique, then synthesis by the selected coordinator. Codex writes the agreed text to files. Adapt rounds to the question; avoid endless consensus seeking. Preserve unresolved disagreements and distinguish evidence from inference. Check references against original sources and experimental claims against supplied results. Agents have no research browsing in this workflow; do not describe supplied citations as independently verified.

Integrate changes with save_draft using the current expected_revision and a change note. Previous manuscripts are archived. A running round locks that session against edits to keep its evidence snapshot coherent. If context exceeds the limit, create a continuation session with a reviewed summary, sources, and current draft; no history is silently truncated. Codex remains responsible for file operations and verification; scientific coordination belongs to the selected coordinator.

Calls consume provider quotas and, for Claude, API tokens. No purchases, automatic API fallback, or account rotation. Claude API use is an explicitly selected provider, not fallback. Do not infer account authorization or provider support from this skill. Surface actual access errors; do not bypass provider access restrictions. Grok disables its tools; agy uses the reference repository's headless stdin approach with a text-only prompt and normal approval behavior. This is not an OS sandbox or a guarantee that arbitrary global CLI plugins/hooks cannot run.

Derive every tool call’s participants explicitly from the saved configuration, excluding `codex` because it runs in the current chat. For the default full council this is `["gemini", "grok", "claude"]`. For compatibility, run_round still defaults to Gemini/Grok when participants is omitted. ask_model accepts provider `claude`; run_round accepts claude_model. At most three external requests run per server. Claude usage and API-reported model appear in completed job results. API HTTP errors are sanitized, incomplete/truncated replies are failures, and requests are not retried automatically. Cancellation stops the local request but cannot guarantee that an accepted API request stops incurring charges. Keep the API key out of all shared packets and source files.

## Coordinator and participants

There are only two settings; the coordinator is also a participant with the same drafting, critique, and approval duties as everyone else. No separate critic roles.

Default for a new project:
```json
{
  "coordinator": "gemini",
  "participants": ["codex", "gemini", "grok", "claude"]
}
```

Accept natural-language selections such as “Gemini coordinates; include Codex and Grok” or “Claude coordinates; use everyone.” Include the coordinator in participants. Supported names are codex, gemini, grok, claude. Require a nonempty unique participant list and a coordinator in that list; clarify contradictory instructions instead of silently adding/removing someone. Every selected participant drafts and critiques every other participant, including the coordinator. With only one participant, explain that no peer critique or multi-agent consensus is possible.

Persist these two fields in `coordination/council.json` under the project's authorized writing directory. Prefer an explicit current user choice, then the saved project configuration, then the default above. Carry the configuration into each session brief and continuation summary. This is a skill-managed workflow configuration, not a new MCP schema or a change to provider model config.json. A coordinator field alone does not execute coordination: Codex must call the selected coordinator for its proposals, critiques, and syntheses.

Only selected external participants receive packets or consume quota. If Codex is omitted from participants, it still handles tool calls, source verification, files, and progress records, but does not contribute a scientific draft or cast an approval vote. MCP bookkeeping may label round requests and saved drafts as codex; that records the operator, not authorship or scientific leadership. Preserve original provider attribution and job IDs for substantive contributions. If there are no selected external participants, do not call run_round with an empty array.

Announce the resolved coordinator and participant list when starting or changing the configuration. Record changes in project state and session history. A newly added participant must complete the task's required reading before drafting or approving; a new coordinator must review the plan and active discussion before taking over. Existing accepted text is not automatically reopened, but record which membership approved it. Pending text requires the currently selected membership's approvals where the task requires unanimity. Never drop an unavailable or dissenting participant without the user's instruction. The coordinator cannot overrule evidence or a required approval.

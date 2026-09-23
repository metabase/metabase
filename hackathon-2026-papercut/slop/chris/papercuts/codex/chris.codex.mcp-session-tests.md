# MCP scope tests passed without reaching the scope check

Source: Codex session 2026-08-03, [transcript](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T13-38-57-019fc76b-7c15-7cc0-a4df-a3c55c4a74fe.jsonl).

Observed sequence: the agent first said the reported scope bug did not reproduce ([line 78](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T13-38-57-019fc76b-7c15-7cc0-a4df-a3c55c4a74fe.jsonl#L78)). The user identified `session-auth` choosing an unrestricted branch before applying bearer scopes in `src/metabase/mcp/api.clj` ([line 85](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T13-38-57-019fc76b-7c15-7cc0-a4df-a3c55c4a74fe.jsonl#L85)).

The first agent-written regression tests called `tools/list` without an MCP initialize handshake. The request returned HTTP 400, `Missing Mcp-Session-Id`; the negative assertion still passed because the tools list was empty. The user caught this and described the assertion as vacuous ([line 379](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T13-38-57-019fc76b-7c15-7cc0-a4df-a3c55c4a74fe.jsonl#L379)). The corrected test failed before the fix and passed after the fix ([line 429](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T13-38-57-019fc76b-7c15-7cc0-a4df-a3c55c4a74fe.jsonl#L429)).

Mechanism: protocol initialization is a prerequisite to testing authorization, but the test checked only absence of a tool. A failed prerequisite produced the same empty observation as successful scope filtering. A sound regression test needs to assert the handshake and request succeeded, plus a positive control for a permitted tool.

Classification: confirmed test papercut and false confidence. The transcript discusses affected release branches, but this note intentionally omits credentials and request material.

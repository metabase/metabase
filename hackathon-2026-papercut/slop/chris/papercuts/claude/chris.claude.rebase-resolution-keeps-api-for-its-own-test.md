---
title: When resolving rebase conflicts, the agent kept the branch's wider API because the branch's own test exercised it, even though the only real caller had been deleted
slug: rebase-resolution-keeps-api-for-its-own-test
kind: agent-behaviour
impact: wasted-time
severity: low
status: open
area: rebase conflict resolution; test/metabase/test/server/handler.clj (PR #77954)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 7514-7701
    date: 2026-09-20
    jev: {self_inflicted_bug: 0.88, tool_misuse: 0.95, misleading_signal: 0.48, user_correction: 0.87, codebase_trap: 0.52, flailing: 0.26, env_friction: 0.83}
---
## Summary
While rebasing #77954 onto master, the agent hit conflicts in the test HTTP handler. Master had reduced
`make-test-handler` to a private no-arg function. The branch had a public two-arity version, a dynamic
`*test-handler*` and `do-with-api-routes`, all added for an explorations test helper. Master had deleted
that helper (re-enabling explorations). The agent first trimmed to master's shape (L7597). Then, at the
next conflicting commit, it saw that commit's own new test (`make-test-handler-configures-mcp-cors-test`)
called the public arity. It restored the branch's whole file: "The commit's own test exercises the
public arity I had trimmed, so I'll take the branch's version of the file here" (L7621). It then kept
`app-api-routes` and both arities in the final cleanup, "since the handler test uses them" (L7674).
User: "why not keep the smaller private function?" (L7676). The agent agreed and redid it with master's
shape. The test now calls the private var through `#'` (L7687-7701).

## Symptom
A user correction after the push, and an extra follow-up commit (`b4d83916af6`) plus a CI run.

## Timeline
- L7530-7554 first conflict: the agent keeps master's private fn plus the branch's `/auth` routes.
- L7555-7598 second conflict (renamed file): minimal version.
- L7603-7622 third conflict: switches to the branch's full version because of the commit's test.
- L7634-7656 drops only the dynamic binding; pushes.
- L7676 user question → L7687 "You're right — the only reason I kept it is a test that exists to cover the arity the deleted explorations helper needed."

## Root cause
Agent reasoning: "a test uses it" was taken as proof that the API is needed. Here the test existed only to
cover code whose only production caller had been deleted.

## Why agents fall for it
Tests look like requirements. During a long conflict series, "make this commit's tests pass" is the local
goal, and nobody asks "who calls this outside tests?".

## Current state
Agent-behaviour pattern; nothing in the repo to change. Chris's memory has related guidance ("No test
theatre — test behavior, not a mirrored delegation").

## Suggested fix
Conflict-resolution habit: for each API the branch widened, grep non-test callers on the rebased tree.
If only tests call it, take the narrower side and adapt the test.

## Detection signal
Resolution rationale that cites only a test as the caller ("the test uses it", "its own test exercises").

## Raw excerpts
```
L7621 [ASSISTANT] The commit's own test exercises the public arity I had trimmed, so I'll take the branch's version of the file here.
L7676 [USER] why not keep the smaller private function?
L7687 [ASSISTANT] You're right — the only reason I kept it is a test that exists to cover the arity the deleted explorations helper needed. With that gone, master's smaller private function plus the branch's two additions is enough, and the test can exercise the 0-arity version.
```

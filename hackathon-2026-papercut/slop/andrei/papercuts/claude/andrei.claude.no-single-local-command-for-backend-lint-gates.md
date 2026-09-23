---
title: No local command mirrors the backend CI lint jobs (cljfmt, kondo, Eastwood on sources, Eastwood on changed tests), so a fix was pushed with only kondo and Eastwood run locally and CI failed on a blank line
slug: no-single-local-command-for-backend-lint-gates
kind: doc-gap
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: .github/workflows/backend.yml (be-cljfmt, be-linter-clj-kondo, Eastwood jobs); mage project-tests
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
    lines: 706-763
    date: 2026-09-11
    jev: {any_papercut: 0.64, env_toolchain: 0.79, stale_state: 0.37, verify_mismatch: 0.71, misleading_code: 0.19, hidden_coupling: 0.37, stale_docs: 0.32, tool_footgun: 0.58, flaky: 0.58, agent_bug: 0.69, wasted_effort: 0.61, user_correction: 0.71}
---
## Summary
The first commit of a backend fix was pushed after kondo and Eastwood passed locally. CI's cljfmt job then failed on a blank line in the new test, which both review rounds reported. The agent confirmed it had run kondo and Eastwood but not cljfmt. `./bin/mage project-tests backend` runs none of the linters, and no single command runs all the backend lint gates, so nothing local would have caught it by default.

## Symptom
L730 (triage of the first review): the agent confirms the cljfmt job is red because of a blank line in the new test and that it skipped cljfmt locally. L739: the second review flags the same blank line at client_test.clj (line 21).

## Timeline
- Earlier in the session: commit pushed with unit tests, kondo and Eastwood green.
- L707: first review report lists cljfmt red in CI.
- L730: agent confirms it skipped cljfmt.
- L739-L763: second review repeats it; the fix list carries "cljfmt (both): the blank line at client_test.clj:21".
- Cost: a red CI run and one more push cycle.

## Root cause
Backend lint gates live in separate CI jobs (`./bin/mage cljfmt-all --force-check`, `./bin/mage kondo`, two Eastwood invocations) with no local aggregate, so agents assemble the list themselves and can leave one out.

## Why agents fall for it
Agents assemble gates from habit; kondo and Eastwood feel like "the linters", and formatting feels cosmetic until CI fails.

## Current state
origin/master bb.edn has `cljfmt-files`, `kondo` and `project-tests` (which runs module, ratchet and layout test namespaces, no linters); no task runs all backend lint gates for a diff.

## Suggested fix
- Add a mage task (for example `./bin/mage lint-changed`) running cljfmt check, kondo and both Eastwood gates on files changed against origin/master, and point agent instructions at it.

## Detection signal
A pushed commit followed by a failing `be-cljfmt` job when the agent's local transcript shows kondo or Eastwood runs but no cljfmt call.

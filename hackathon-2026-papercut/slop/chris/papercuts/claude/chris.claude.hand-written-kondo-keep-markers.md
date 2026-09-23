---
title: Agents hand-write the tool-generated `[kondo-keep]` marker, faking "verified false positive" provenance
slug: hand-written-kondo-keep-markers
kind: agent-behaviour
impact: introduced-bug
severity: medium
status: open
area: mage/src/mage/kondo_ratchet.clj (keep-marker), inline :clj-kondo/ignore comments
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl
    lines: 633-672
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.59, misleading_signal: 0.82, user_correction: 0.14, codebase_trap: 0.93, flailing: 0.62, env_friction: 0.75}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-ad334f260d4e69004.jsonl
    lines: 439-513
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.22, misleading_signal: 0.66, user_correction: 0.85, codebase_trap: 0.89, flailing: 0.46, env_friction: 0.57}
---
## Summary
`;; [kondo-keep] suppresses a warning :redundant-ignore can't see; --audit rechecks` is meant to be written only by `mage kondo-redundant-ignores --fix` after it verified that an ignore is a `:redundant-ignore` false positive. Sites carrying it are then skipped by the redundant-ignore check. Batch D copied the marker from neighbouring ignores when adding its own new suppressions, so six ignores were marked "verified" that no tool had ever checked (execute_test 1 -> 4, field_test 0 -> 1, warehouses_rest 0 -> 2).

## Symptom
Coordinator audit, parent L645: `test/metabase/driver/sql_jdbc/execute_test.clj  ignores HEAD=0 now=3 | keep-markers HEAD=1 now=4`.

## Timeline
- Parent L633: shows a new suppression with the full keep comment attached.
- Parent L649: "six `[kondo-keep]` markers were fabricated ... That marker is generated only by `mage kondo-redundant-ignores --fix` and asserts a verified false positive; hand-writing it invents tooling provenance that never happened."
- Subagent D L477: "Applying all 11 edits: 6 conversions ... and 5 deletions of fabricated markers, keeping the genuine why-comments and the two HEAD markers."
- Subagent D L513: "Marker cleanup verified (all seven files back to their HEAD counts)".

## Root cause
The marker is a plain comment with a fixed string, and it sits directly above the ignore it annotates, so it looks like part of the idiomatic "ignore + comment" block. Nothing records that a tool produced it, and nothing fails when a marker appears on a fresh ignore. Agents pattern-copy whole blocks from nearby code.

## Why agents fall for it
When told "every ignore needs an explanatory comment", the nearest example is a two-line block (why-comment + keep marker + ignore). Copying the block feels like following house style.

## Current state
`mage/src/mage/kondo_ratchet.clj:28-34` defines `keep-marker` = `"[kondo-keep]"` and the canonical comment; `redundant-ignores` skips marked sites unless `--audit` (:331-363). No check that a marker was added by the tool. 27 test files currently carry the marker. Not documented in CLAUDE.md or memory as "don't hand-write".

## Suggested fix
- Make `kondo-ratchets` (which CI runs) fail when a `[kondo-keep]` marker is new relative to the merge base unless `kondo-redundant-ignores --fix` output accompanies it, or run `--audit` over only newly added markers in CI.
- Reword the marker so it reads as machine output, e.g. `;; [kondo-keep: added by mage kondo-redundant-ignores --fix; do not write by hand]`.
- Mention it in CLAUDE.md's Ratchets section.

## Detection signal
Diff adds a line containing `[kondo-keep]` in a session that never ran `kondo-redundant-ignores`; git-diff count of markers rising in a feature PR.

## Raw excerpts
```
L649 [ASSISTANT] All 22 suppressions citing the Jetty premise are **new** — `HEAD=0` in every file, so none is pre-existing. Worse, six `[kondo-keep]` markers were fabricated: `execute_test` went from 1 to 4, `field_test` 0 to 1, `warehouses_rest` 0 to 2. That marker is generated only by `mage kondo-redundant-ignores --fix` and asserts a verified false positive; hand-writing it invents tooling provenance that never happened.
```

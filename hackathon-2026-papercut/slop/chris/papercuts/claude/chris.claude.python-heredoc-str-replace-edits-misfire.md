---
title: Scripted `python3 - <<PY ... s.replace(old, new, 1)` edits hit the wrong anchor, abort half-way, or over-apply, and the agent then misreads the result
slug: python-heredoc-str-replace-edits-misfire
kind: agent-behaviour
impact: both
severity: medium
status: open
area: any repo; heavy in evals (stats/build.py, tests/test_stats_sanitize.py) and metabase kondo-ratchet branches
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1580-1640
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.76, misleading_signal: 0.84, user_correction: 0.13, codebase_trap: 0.83, flailing: 0.59, env_friction: 0.55}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 2196-2251
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.95, misleading_signal: 0.60, user_correction: 0.11, codebase_trap: 0.85, flailing: 0.65, env_friction: 0.85}
---
## Summary
The agent edits files with inline Python instead of the Edit tool. The scripts do `s.replace(old, new, 1)`, `s.index(anchor)`, and blanket `s.replace(stub, "")`. Four failure modes showed up in one session:
1. **Wrong anchor.** The first occurrence of a line that appears in two functions was in the wrong function. The mutation landed in `_stage_index` instead of `_settle_semantic_index`, so a "does the test pin ordering?" check gave a false answer.
2. **Half-applied script.** `ValueError: substring not found` / `AssertionError` after some `replace` calls already ran in memory. `p.write_text` never ran, so nothing was written, but the pytest chained after it still ran and reported a stale failure.
3. **Over-applied blanket replace.** `s.replace(stub, "")` removed a monkeypatch from a test that still needed it.
4. **Truncated view.** A `sed -n '/^def f/,/^    if backlog:/p'` range stopped before the code under inspection. The agent concluded the check "had no effect" when it was simply outside the printed range.

Each one produced a misleading signal: a green test, or an apparently unchanged file. The agent then reasoned from that signal.

## Symptom
- L1606: "does the new test actually pin the ordering? move the check above the boot" -> `2 passed` for both the mutated and the restored file.
- L1611-1614: "--- mutated settle, first 14 lines ---" shows no check at all. ASSISTANT: "The block landed in the wrong function (an earlier identical anchor line)."
- L1616: "settle with the check removed entirely ... 4 passed". A wrong inference built on the wrong mutation.
- L1630 ASSISTANT: "I confused myself — my `sed` range stopped before the check, so I was reading a truncated view."
- L2201: `ValueError: substring not found` then `FAILED ...test_general_search_is_given_time_to_settle...`. L2207: "The first script aborted before writing (the two tests are in the opposite order)."
- L2219: `AssertionError` from a second script.
- L2234-2237: "settle stubs removed: 2". ASSISTANT: "I over-reached there — that blanket replace also stripped the stub from `test_the_index_stage_measures_the_table_it_records`, which legitimately needs it".
- Also L1580: "Remove the bogus patch added a moment ago" (`monkeypatch.setattr(stats_build, "general_search_population", ..., raising=False)`). The `raising=False` let a patch on a nonexistent attribute pass silently.

## Timeline
- L1605: first mutation attempt via Python replace. The test stays green.
- L1610-1616: the agent inspects with a sed range, concludes the check is absent, and runs tests against "no check".
- L1626-1632: greps line numbers, finds the check intact, restores from `$SP/build.py.good`.
- L1636-1637: redoes the mutation scoped to `fn_start = s.index("def _settle_semantic_index")` ... `fn_end`. Now `FAILED test_a_rotation_the_drain_boot_causes_is_still_caught`, the correct result.
- L2200-2251: three more scripted edits to remove an obsolete test. They abort twice and over-apply once, then a targeted restore.

## Root cause
Python `str.replace(…, 1)` and `str.index` pick the first textual match anywhere in the file, with no notion of the enclosing function. The Edit tool's uniqueness check (it refuses non-unique `old_string`) exists to prevent exactly this. The inline scripts skip it. Chaining `python3 ... ; uv run pytest` runs the tests even when the edit script died.

Contributing: the user's Edit hook reindents some Clojure macros (memory `reference_edit_hook_reindents_style_indent_macros.md`, "edit via perl"). That pushes agents toward scripted edits in general, and the habit carries over to Python files where Edit would be fine.

## Why agents fall for it
- A script can batch many substitutions and asserts in one tool call, which looks efficient.
- `assert s.count(old) == 1` is sometimes present (L1413, L2248) and sometimes not (L1610, L2227). When it's missing, the first-match behaviour is silent.
- The output line ("scalar stubs split", "tests updated") prints whether or not the substitution matched what the agent meant.

## Current state
Still open as a behaviour. No memory or CLAUDE.md guidance says to prefer Edit or to assert uniqueness in scripted edits. The only related memory, `reference_edit_hook_reindents_style_indent_macros.md`, pushes the other way for Clojure.

## Suggested fix
- Add to the global CLAUDE.md: "Scripted multi-edit: every `replace` must `assert s.count(old) == 1`, scope by function when the anchor may repeat, and chain the test run with `&&` so a failed edit script stops it."
- For mutation checks, use a helper that takes (file, function-name, old, new) and refuses when the snippet isn't unique within that function. The session built one ad hoc at L1858 (`SNIPPET NOT UNIQUE`).
- Prefer the Edit tool for Python files.

## Detection signal
- A `python3 - <<` heredoc containing `.replace(` without `count(` or `assert`, followed by `;` rather than `&&` before a test command.
- A tool result containing `Traceback` / `substring not found` / `AssertionError` followed by pytest output in the same result.
- Assistant phrases: "landed in the wrong function", "I over-reached", "the first script aborted before writing".

## Raw excerpts
```
L1611 [RESULT] --- mutated settle, first 14 lines ---
def _settle_semantic_index(context: BuildContext) -> None:
    ...
    backlog = int(_scalar_query(vector_url, sql.SEMANTIC_GATE_BACKLOG))
    if backlog:
L1614 [ASSISTANT] The block landed in the wrong function (an earlier identical anchor line). Settle now has no check at all — let me run the tests against that.
```
```
L2201 [RESULT] Traceback (most recent call last):
  File "<stdin>", line 26, in <module>
ValueError: substring not found
=========================== short test summary info ============================
FAILED tests/test_stats_sanitize.py::test_general_search_is_given_time_to_settle_before_the_container_stops
1 failed, 1371 passed, 1 skipped in 35.91s
```

## Additional occurrence
(from batch b5; full write-up in `chris.claude.python-used-on-clojure-edn-despite-memory.md`, which covers the memory-violation angle)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-search-reindex-should-use-a-dedicated-lease-not-the-cluster/e3372045-21d0-4423-a7d8-a42d1960d9f7/subagents/agent-a866d6468d3e9ce14.jsonl lines 65-74: `python3 - <<EOF ... assert s.count(old) == 1; s.replace(old, new)` on `src/metabase/search/lease.clj`, mixed with `git checkout` and a perl edit, left a `config/is-test?` call without its require -> `Syntax error compiling at (metabase/search/lease.clj:392:1). No such namespace: config`.
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/cfa33e63-6d28-41e3-b4de-0fa2b9ca5cf1.jsonl lines 1030, 1064-1092: `s.index('## Some deviations cannot be burned down')` -> `ValueError: substring not found` (doc heading had been reworded); and a regex EDN parse of `.clj-kondo/ratchets.edn` matched `:ignore-counts` inside the file's header comment -> 0 linters -> `ZeroDivisionError`.
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-search-delete-00-memoize-model-hooks/bc72fc8d-5805-4236-9f38-c525a085b500.jsonl lines 483-484: Python `replace` on `src/metabase/util/queue.clj` for a mutation check (worked; still a no-Python-for-Clojure violation).

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
  lines: 1462-1503
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.98, tool_misuse: 0.62, misleading_signal: 0.56, user_correction: 0.21, codebase_trap: 0.87, flailing: 0.77, env_friction: 0.81}
- Half-applied script, failure mode 2 above: `infra_toplevel.py` asserted on an anchor in its second target file (`mage/test/mage/modules_test.clj`, whose ns form differed) after it had already rewritten `deps_graph.clj` in memory. The chained `./bin/mage -test` still ran and reported the stale `actual: (not (<= 46 44))`. L1488: "The script aborted before writing the mage test file."
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 1343-1349, 1846-1851
  date: 2026-08-29
- A regex diff3-conflict resolver asserted on a hunk with an empty section and left 4 markers (paren balance −10). A line-range "remove wrapper and dedent 40 lines" script unbalanced `runner.clj` (kondo: `Expected a ) to match ( from line 345`). Restored with `git checkout --` and redone.

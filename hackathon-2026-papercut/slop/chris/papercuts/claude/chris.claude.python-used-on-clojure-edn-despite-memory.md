---
title: Agents keep using Python (string replace / regex) to parse EDN and edit .clj source despite the no-Python-for-Clojure memory
slug: python-used-on-clojure-edn-despite-memory
kind: agent-behaviour
impact: both
severity: low
status: documented-still-hit
area: memory feedback_no_python.md; .clj-kondo/ratchets.edn; src/metabase/util/queue.clj; src/metabase/search/lease.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/cfa33e63-6d28-41e3-b4de-0fa2b9ca5cf1.jsonl
    lines: 1064-1092
    date: 2026-08-27
    jev: {self_inflicted_bug: 0.80, tool_misuse: 0.80, misleading_signal: 0.64, user_correction: 0.96, codebase_trap: 0.85, flailing: 0.39, env_friction: 0.83}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-search-delete-00-memoize-model-hooks/bc72fc8d-5805-4236-9f38-c525a085b500.jsonl
    lines: 483-484
    date: 2026-08-17
    jev: {self_inflicted_bug: 0.85, tool_misuse: 0.89, misleading_signal: 0.63, user_correction: 0.44, codebase_trap: 0.61, flailing: 0.56, env_friction: 0.88}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-uxw-4796-search-reindex-should-use-a-dedicated-lease-not-the-cluster/e3372045-21d0-4423-a7d8-a42d1960d9f7/subagents/agent-a866d6468d3e9ce14.jsonl
    lines: 65-74
    date: 2026-09
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.89, misleading_signal: 0.61, user_correction: 0.25, codebase_trap: 0.75, flailing: 0.44, env_friction: 0.85}
---
## Summary
Memory `feedback_no_python.md` says: don't use Python to read or rewrite Clojure/EDN source; use bb + rewrite-clj, the nREPL, or the Edit tool. It is loaded via MEMORY.md ("No Python for Clojure work — EDN/Clojure source only"). Three sessions in this batch still did it:
1. cfa33e63: regex-parsed `.clj-kondo/ratchets.edn` in Python to tally ignores by severity. The file header comment contains the literal token `:ignore-counts`, so `s.index(':ignore-counts')` found the comment, the parser returned 0 linters for the stack-tip file and crashed with `ZeroDivisionError`; the agent then hand-wrote a brace-matching parser with a "real section key is the one immediately followed by a map" heuristic.
2. bc72fc8d: Python `open().read().replace()` to mutate `src/metabase/util/queue.clj` for a mutation test.
3. subagent a866: Python `assert s.count(old) == 1; s.replace(old, new)` on `src/metabase/search/lease.clj`; combined with a `git checkout` of the file and a perl edit, it produced a `config/is-test?` reference without the `metabase.config.core` require -> "Syntax error ... No such namespace: config" (L71), one wasted test run.

## Symptom
```
cfa33e63 L1068 stack tip: inline   (0 linters, 0 ignores)
  ZeroDivisionError: division by zero
a866 L71 Syntax error compiling at (metabase/search/lease.clj:392:1). No such namespace: config
```

## Root cause
Agent habit; the ratchets.edn header deliberately documents its own keys in comments, which breaks naive text search. bb can `edn/read-string` the file in one line.

## Why agents fall for it
Python heredocs are the model's default scripting tool; the memory is phrased as a preference, and small "throwaway" edits don't feel like "rewriting Clojure source".

## Current state
Memory present (`feedback_no_python.md`, modified 2026-07-28), still hit in Aug and Sep.

## Suggested fix
- A PreToolUse hook that warns when a Bash command contains `python3` and a `.clj`/`.cljc`/`.edn` path.
- For read-only EDN analysis, add a one-liner to memory: `bb -e '(-> (slurp ".clj-kondo/ratchets.edn") clojure.edn/read-string :ignore-counts)'`.

## Detection signal
`python3 - <<` or `python3 -c` with `open('...clj'` / `.edn` in the same command.

## Raw excerpts
```
cfa33e63 L1071 python3 - <<'PY'
import re
def section(s, name):
    # the real section key is the one immediately followed by a map
bc72fc8d L483 python3 - <<'EOF'
p='src/metabase/util/queue.clj'
s=open(p).read()
```

## See also
`chris.claude.python-heredoc-str-replace-edits-misfire.md` (the general misfire pattern of scripted Python edits).

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/26fde2ad-8bfb-4ad4-87bf-7b539ddf6e82.jsonl
  lines: 129-130
  date: unknown
  jev: {self_inflicted_bug: 0.96, tool_misuse: 0.84, misleading_signal: 0.49, user_correction: 0.64, codebase_trap: 0.81, flailing: 0.33, env_friction: 0.77}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-78704-copy-transform-models/9201d948-0009-4073-b8a4-a56cab4824a2.jsonl
  lines: 485-502
  date: 2026-09-10
  jev: {self_inflicted_bug: 0.89, tool_misuse: 0.95, misleading_signal: 0.71, user_correction: 0.62, codebase_trap: 0.35, flailing: 0.27, env_friction: 0.90}

- 26fde2ad L129: `python3 - <<'EOF'` with `s.replace(old, new)` on `dev/src/dev/hierarchy_visualization.clj` to add a
  `sort-by` (harmless outcome, but exactly the pattern the memory forbids).
- 9201d948 L485-502: backporting tests to release-x.58, the agent rewrote `test/metabase/cmd/copy_test.clj` with a
  python heredoc using `'''` string literals. A SQL string in the Clojure source came out as
  `WHERE COLUMN_NAME = \'ID\' AND IS_IDENTITY = \'YES\'`, and the test failed to read:
  `Syntax error reading source at (metabase/cmd/copy_test.clj:102:27). Unsupported escape character: \'` (L496).
  L500: "My heredoc escaping mangled the SQL quotes." Fixed with a perl one-liner. This is the failure mode the
  memory predicts: a text tool with its own escaping rules produces a Clojure reader error.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-slackbot-uploads-cleanup/1843e5b3-3fe3-44ac-9b08-6979092176bc.jsonl
  lines: 156-178
  date: 2026-09-12 (approx.)
  jev: {self_inflicted_bug: 0.94, tool_misuse: 0.87, misleading_signal: 0.66, user_correction: 0.14, codebase_trap: 0.54, flailing: 0.80, env_friction: 0.91}

During a rebase conflict, the agent rewrote the whole of `src/metabase/slackbot/uploads.clj` with a `cat > ... <<'CLJEOF'` heredoc (L157). It then spliced `api.clj` with Python: `s.index('(defn- all-files-skipped?')` … `s.index('(defmethod analytics.core/known-labels ...')` and `open(p,'w').write(s[:start]+new+s[end:])` (L168). It read `feedback_no_python.md` only *after* making the edit (L172-173): "Noted — I should use structural tools for Clojure source, not Python slicing." It checked paren balance with a bb reader loop (L177). The memory is in MEMORY.md's index, but the agent reached for Python first and the memory second. That rewrite fed into the same rebase commit that went in with conflict markers in the modules config (see `bsd-tools-silent-failure-commits-conflict-markers`, additional occurrence).
Batch b4 also saw a Python heredoc used on YAML (data-stack `source.yml`, stats session L2962). That's allowed by the memory (it covers Clojure/EDN only).

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
  lines: 903-989, 1076, 1107, 1151, 1211-1228, 1295, 1313-1349, 1373-1434, 1553-1579, 1650, 1679, 3019-3029, 3224, 3528
  date: 2026-08-29/30
  jev (chunk 4): {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.60, user_correction: 0.14, codebase_trap: 0.82, flailing: 0.54, env_friction: 0.70}
- Nearly every Clojure edit and every conflict resolution in this session was a `python3 - <<'PY'` script doing regex over diff3 markers or `s.replace(old, new, 1)` on `.clj` source. It even wrote reusable `/tmp/showconf.py` and `/tmp/resolve.py` conflict parsers (L1369-1373). Failures: L1343-1347 "My regex mishandles empty sections" (AssertionError, 4 markers left, paren balance −10); L1846-1851 "removed wrapper (lines 321-364), dedented 40 lines" → kondo `Expected a ) to match ( from line 345` → `git checkout` and redo.

- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
  lines: 1117, 1141-1165, 1236-1241, 1346-1376, 1383-1422, 1462-1503
  date: 2026-08-30
  jev (chunk 3, 1307-1761): {self_inflicted_bug: 0.98, tool_misuse: 0.62, misleading_signal: 0.56, user_correction: 0.21, codebase_trap: 0.87, flailing: 0.77, env_friction: 0.81}
- Python scripts in the scratchpad (`reorder.py`, `docstring.py`, `toratchet.py`, `resolve_ratchets.py`, `r_deps.py`, `r_modtest.py`, `infra_toplevel.py`, `infra_magetest.py`) edited `dev/src/dev/deps_graph.clj`, `mage/test/mage/modules_test.clj` and `ratchets.edn`. `resolve_ratchets.py` parsed a one-line EDN map with string splitting and needed a follow-up patch for a key rename (L1375). L1476: `infra_toplevel.py` hit `AssertionError` after editing half its targets. L1488 "The script aborted before writing the mage test file. Re-applying that half". A `git checkout --theirs` resolution also wiped the agent's own renames (L1401-1417, "Right — that reverted my changes there"). See also `python-heredoc-str-replace-edits-misfire`.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
  lines: 219-245, 433-443
  date: 2026-08-21
  jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}

Python `s.index(...)` / `s.replace(old, new)` heredocs were used for every Clojure edit while "fixing all" the /code-review findings on PR #80468:
`enterprise/backend/src/metabase_enterprise/metabot/api/permissions.clj` (L219, L433), `test/metabase/app_db/schema_migrations_test.clj` (L223:
truncate from `s.index('\n(deftest clear-tenant-metabot-perms-in-advanced-mode-test')`), `.../metabot/api/permissions_test.clj` (L226, L236,
L443), and a `cat > ... <<'EOF'` rewrite of `.../metabot/permissions_test.clj` (L240). One slip followed: clj-kondo then reported
`Unresolved symbol: group-a` / `group-b` in the rewritten test (L293). The agent dismissed it as "kondo hook-loading noise" (L296) and committed.
The tests passed, so it was either a real kondo-visible binding problem or hook noise (see bare-clj-kondo-lint-misses-repo-hooks).
The Python edits hid the diff from the Edit tool's review. The next session (f6535e97) used the Edit tool throughout.

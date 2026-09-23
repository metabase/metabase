---
title: The clj-paren-repair Edit hook silently "repairs" an intentionally unbalanced edit (open a wrapper form now, close it later) by closing forms early and corrupting distant forms, while Edit reports success; the recommended perl workaround leads to paren-counting fumbles
slug: clj-paren-repair-hook-silently-restructures-edits
kind: tool-quirk
impact: both
severity: medium
status: documented-still-hit
merged_from: [paren-repair-hook-rewrites-deliberately-unbalanced-edit]
area: ~/.claude/settings.json:15-23 PreToolUse/PostToolUse "clj-paren-repair-claude-hook --cljfmt" on Edit|Write; any .clj edit; memory reference_edit_hook_reindents_style_indent_macros.md
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1622-1646
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.69, misleading_signal: 0.88, user_correction: 0.84, codebase_trap: 0.77, flailing: 0.62, env_friction: 0.84}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/1dece064-f6c3-42cc-b09d-dc78ef3603ff.jsonl
    lines: 631-675
    date: ~2026-09-16
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.87, misleading_signal: 0.75, user_correction: 0.86, codebase_trap: 0.76, flailing: 0.44, env_friction: 0.90}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 787-844
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.88, misleading_signal: 0.77, user_correction: 0.08, codebase_trap: 0.75, flailing: 0.77, env_friction: 0.81}
---
## Summary
`~/.claude/settings.json` runs `clj-paren-repair-claude-hook --cljfmt` before and after every Edit/Write. An agent
wrapping an existing form in a new one naturally edits the opening line first and plans to add the closing paren at
the end in a second edit (natural when the body is long and the Edit tool requires unique `old_string`s). After the
first Edit, the hook repairs the unbalanced file parinfer-style, inferring closers from indentation. The Edit tool
reports "updated successfully (file state is current in your context -- no need to Read it back)" and gives no hint
that the structure changed, so the agent's model of the file is wrong.

- 31b066ea: wrapping `(transduce ...)` in `(locking lock ...)`, the hook closed the new form immediately:
  `(transduce)` became an empty call and the rest of the body was left outside it. The agent noticed only because
  it re-read the region.
- a60c5f8a (subagent): wrapping a long deftest body in `(mt/with-model-cleanup [:model/Card] ...)`, the hook closed
  the `let` bindings immediately (`(let [mp (mt/metadata-provider)]`) and shifted structure elsewhere, including a
  `letfn` ~1700 lines away (L2942). A test run launched on the corrupted file died with a spec error, and the agent
  had to `git checkout` the file and redo both edits via a Python script. The parent agent later had to eyeball the
  diff because the subagent warned "the formatting hook corrupted parens mid-edit in `card_test.clj`".

The memory about this hook tells agents to edit Clojure with `perl -0pi -e` instead. In another session (1dece064)
that workaround produced four failed attempts in a row at matching a run of closing parens with a regex.

## Symptom
```
31b066ea
L1623 [TOOL Edit] test/metabase/test/util.clj OLD=(defn do-with-column-remappings! [orig->remapped thunk]
  (transduce NEW=(def ^:private column-remapping-lock ...) (defn do-with-column-remappings! [orig->remapped thunk]
  (locking column-remapping-lock
    (transduce
L1631 [RESULT] The file ... has been updated successfully.
L1636 [ASSISTANT] I added the wrapper but need to close it. Reading the region.
L1641 [ASSISTANT] The formatter closed `(transduce)` prematurely. Fixing the structure.
L1642 python3 - <<'PY' ... old = """  (locking column-remapping-lock\n    (transduce)\n    identity\n""" ...
```
```
a60c5f8a
L797 (deftest updating-model-query-does-not-shift-metadata-overrides-test
  (testing "..."
    (mt/with-model-cleanup [:model/Card]
      (let [mp                 (mt/metadata-provider)]
        orders-table       (lib.metadata/table ...
L836 ... failed: vector? at: [:fn-tail :arity-n :params] spec: :clojure.core.specs.alpha/param-list
```
```
1dece064
L637 [RESULT ERROR] Exit code 255   test at -e line 1, <> chunk 1.        (perl `or die "test"`: pattern not found)
L654 [RESULT] linting took 256ms, errors: 1                                (inserted too many ')')
L658 test/metabase/search/appdb/scoring_test.clj:405:126: error: Unmatched bracket: unexpected )
L668 perl -0pi -e 's/:curated true\}\)\)\)\)\)\)\)\)\)\)\)\)\n/:curated true}))))))))))))\n/' -> errors: 1
L674 perl -0pi -e 's/:curated true\}\)+\n/:curated true})))))))))))\n/' -> errors: 0
```

## Timeline
Subagent a60c5f8a (fix-app-db-rollback-only, 2026-08-24):
- L792 Edit inserts `(mt/with-model-cleanup [:model/Card]` line -> "updated successfully".
- L795 "My wrap added an opening paren without closing it -- must fix the balance at the end of that deftest."
- L797 reads file: the hook has already rebalanced it wrongly. L799 "The formatter mangled the wrap."
- L800-804 rebuilds that deftest from `git show HEAD:` via Python; `bb` reader check "OK 268 forms".
- L809/L834-836 a background test run started in between died on the corrupted file.
- L838 "My earlier unbalanced Edit triggered a parinfer-style hook that corrupted distant regions (letfn at 2942). Recover: reset the file and re-apply both fixes via python on the clean base."

Session 31b066ea (2026-08-25):
- L1622-1631: a two-step wrap edit. The hook closes the new form after step 1.
- L1636-1646: the agent reads the file, sees `(transduce)`, repairs it with a Python string replace, runs cljfmt and
  kondo, and verifies the structure.

Session 1dece064 (~2026-09-16):
- L631: a multi-substitution perl edit adds a `testing` block to the tail of a deeply nested test. The
  `or die` fires because the regex for the closing-paren run did not match.
- L653-674: three more perl attempts, each with a different count of `\)`, until clj-kondo stops reporting
  "Unmatched bracket".

## Root cause
A global hook treats every intermediate edit as a finished file and "repairs" it by inserting closers where
indentation suggests, which is wrong for intermediate states and can move structure far from the edit. It does not
report what it changed, and the Edit tool's success message asserts the agent's view is current when the hook has
changed the file. Working around the hook moves the agent to regex-based editing of paren runs, which is fragile in
Lisp.

## Why agents fall for it
Multi-step edits are normal. Nothing tells the agent a hook runs, or that intermediate unbalanced states are not
allowed. The Edit result says success. The memory steers agents toward perl, which trades one silent failure for
counting parens in regexes. Neither path gives structural feedback until kondo runs.

## Current state
`~/.claude/settings.json:15-23` hooks (checked 2026-09-23): PreToolUse and PostToolUse `Write|Edit` ->
`clj-paren-repair-claude-hook --cljfmt`, and the same on SessionEnd. Memory
`reference_edit_hook_reindents_style_indent_macros.md` documents the hook's reindenting of `:style/indent` macros
and recommends perl from Bash. It does not mention early closing of unbalanced intermediate edits. Not in the
clojure-write skill or CLAUDE.md.

## Suggested fix
- Hook: when the post-edit file is unbalanced, report it back to the agent (non-zero exit with a message, for
  example "paren-repair inserted `)` at line N; your edit was unbalanced") or refuse the edit instead of repairing
  it; or only repair when the pre-edit file was balanced and the edit region alone is unbalanced. At minimum print a
  notice whenever it changes paren structure, not only whitespace.
- Update the memory/skill: "Every Edit to a .clj must leave the file balanced; wrap a form by replacing the whole
  form in one Edit that includes both the opening and the closing paren, never open-then-close." Avoid perl for
  paren runs; use rewrite-clj or a single whole-form Edit.

## Detection signal
An Edit on a `.clj` file whose `new_string` has more `(` than `)` (or vice versa) compared with `old_string`,
followed by a later Edit, "closed prematurely"/"mangled"/"corrupted" language, or `git checkout -- <file>.clj` right
after the Edit. Also: `Unmatched bracket` from clj-kondo right after a `perl -0pi` edit.

## Raw excerpts
```
31b066ea
L1646 [RESULT] (defn do-with-column-remappings! [orig->remapped thunk]
  (locking column-remapping-lock
    (transduce
     identity
     (fn
       ([] thunk)
       ...
     orig->remapped)))
L1654 [ASSISTANT] Structure is correct. Testing against MariaDB — repeatedly, since the deadlock is probabilistic.
```
```
a60c5f8a
L792 [TOOL Edit] .../card_test.clj OLD=(deftest updating-model-query-does-not-shift-metadata-overrides-test
  (testing "Metadata should not shift ... (#60930)"
    (let [mp                 (mt/metadata-provider) NEW=(deftest updating-model-query-does-not-shift-metadata-overrides-test
  (testing "Metadata should not shift ... (#60930)"
    (mt/with-model-cleanup [:model/Card]
     (let [mp                 (mt/metadata-provider)
L793 [RESULT] The file ... has been updated successfully. (file state is current in your context -- no need to Read it back)
```

---
title: A rebase silently auto-merged a duplicate `defn` into a non-conflicting part of util.cljc; `git checkout --ours` on the conflicted files and kondo on only the edited files both looked clean
slug: rebase-automerge-duplicate-defn-unlinted
kind: misleading-signal
impact: introduced-bug
severity: medium
status: open
area: git rebase/restack workflow; src/metabase/util.cljc; post-rebase verification (kondo :redefined-var)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 1034-1131, 1630-1651
    date: 2026-08-29
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.74, misleading_signal: 0.56, user_correction: 0.26, codebase_trap: 0.87, flailing: 0.35, env_friction: 0.93}
---
## Summary
While restacking PR #79979 onto a master that had drifted 370 commits, the agent found that master had
already added `u/trimmed-string`, the same helper the branch introduced. It resolved the conflicting hunks in
`llm/settings.clj` and `metabot/settings.clj` with `git checkout --ours`. It also ran
`git checkout --ours src/metabase/util.cljc test/metabase/util_test.cljc 2>/dev/null || true`, which was a
no-op because those files had not conflicted. Git had placed the branch's `(defn trimmed-string ...)`
roughly 1170 lines below master's copy, with no textual overlap, so both definitions survived. Clojure lets the
later one win silently. It dropped master's `^String` hint and used a different helper (`not-blank` versus
`not-empty`). kondo then ran on the five files the agent had edited, not on `util.cljc`, and reported
"errors: 0, warnings: 0". Tests passed. The duplicate was caught only by the next roborev review.

## Symptom
```
L1638 [ASSISTANT] Confirmed — a real bug I introduced. The rebase auto-merged my definition into a different location,
so it never conflicted and my `checkout --ours` was a no-op. Mine shadows master's and drops its `^String` hint.
L1635 [RESULT] === trimmed-string definitions in util.cljc ===
202:(defn trimmed-string
1369:(defn trimmed-string
```

## Timeline
- L1034-1049: before restacking, the agent confirms "`u/trimmed-string` is **already on master** — the dedup landed independently".
- L1051-1061: restack conflicts in `llm/settings.clj`, `metabot/settings.clj`. `git checkout --ours` on both.
- L1125: `git checkout --ours src/metabase/util.cljc test/metabase/util_test.cljc 2>/dev/null || true`. Stderr is discarded, so there is no sign the paths weren't conflicted.
- L1129-1131: `git rebase --skip` of the follow-up commit "Normalize provider/model settings on set, and share the trim helper" ("entirely superseded").
- L1134-1141: `./bin/mage kondo` on 5 edited files → 0/0. util.cljc is not in the list.
- L1629-1635: roborev 5046 reports the duplicate; the agent confirms two `defn trimmed-string`.
- L1650-1651: removes the duplicate; `util.cljc` is now identical to master.

## Root cause
Git's line-based merge doesn't know about Clojure top-level definitions. Two branches adding the same `defn` in
different places merge cleanly. `git checkout --ours <file>` only helps for files that actually conflict, and
it succeeds silently on the others (and here stderr was dropped). The repo's kondo config would flag
`:redefined-var` (a default-on linter), but only when that file is linted. The agent's post-rebase lint scope
was "files I edited", not "files the rebase changed".

## Why agents fall for it
After a conflict-heavy rebase, "no markers left + kondo clean on what I touched + module tests green" feels
thorough. The agent had already reasoned "master has this helper, so my copy is superseded", so the idea
that its copy still existed never came up. `2>/dev/null || true` removed the one hint.

## Current state
- `src/metabase/util.cljc:189` has a single `trimmed-string` on master. The general trap still exists: nothing lints the whole post-rebase diff automatically. CI's kondo job would catch it, but only after a push.
- Not documented in CLAUDE.md or memory. The global CLAUDE.md git notes cover git-spice and `git replay` but not "lint the files the rebase touched".

## Suggested fix
- A post-rebase habit or tool: `./bin/mage kondo $(git diff --name-only <old-base>..HEAD -- '*.clj*')` (or `mage kondo-updated <trunk>`) after any restack, not just on edited files. `restack-branches` could print this command, or run it, when a restack finishes.
- A cheap duplicate-top-level-def check in the pre-push path (`clj-kondo --lint` on changed files with `:redefined-var` at `:error`).
- Skill or CLAUDE.md note: "When a branch adds a helper that trunk also added, grep for the definition after the rebase. Git may keep both copies without conflicting."

## Detection signal
- Transcript: `git checkout --ours <path> 2>/dev/null` on a path not listed by `git diff --name-only --diff-filter=U`. Or post-rebase lint commands whose file list is narrower than `git diff --name-only <base>..HEAD`.
- Repo: `rg -c '^\(defn-? (\S+)' | ...` duplicate-name check, or kondo `:redefined-var` findings in CI on a branch whose last operation was a rebase.

## Raw excerpts
```
L1125 [TOOL Bash] ... sed -i '' '/^              metabase\.metabot\.provider-util$/d' .clj-kondo/config/modules/config.edn
git checkout --ours src/metabase/util.cljc test/metabase/util_test.cljc 2>/dev/null || true
git add -A
git-spice rebase continue 2>&1 | tail -12

L1635 --- line 202
    (defn trimmed-string
      "`value` trimmed of surrounding whitespace, or nil when it is not a string or has nothing left once trimmed."
      ^String [value]
      (when (string? value)
        (not-empty (str/trim value))))
  --- line 1369
    (defn trimmed-string
      "Trim `value` and return it when non-empty; return nil for blank or non-string values."
      [value]
      (when (string? value)
        (not-blank (str/trim value))))
```
Related, same restack: stale `^:sequential` test metadata from the branch survived the rebase into files that did not
conflict (L1001-1011). Hawk ignores it, so those tests silently lost isolation. This one is now caught by the
`:metabase/validate-deftest` kondo hook (`.clj-kondo/src/hooks/clojure/test.clj:65`, "`^:sequential` is ignored by
Hawk"), which fired at L1509.

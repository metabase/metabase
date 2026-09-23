---
title: Release-branch and backport automation hits silent git/GHA quirks - `git rm --ignore-unmatch` outside the sparse cone removes nothing, `cherry-pick --continue` exits 1 on an emptied pick under `bash -eo pipefail`, `echo` leaves `\n` literal, and a new `.clj-kondo/` file is gitignored
slug: backport-cherry-pick-sparse-checkout-quirks
kind: tool-quirk
impact: both
severity: medium
status: fixed
area: .github/actions/create-backport/action.yml, .github/actions/create-backport/kondo-ratchets.sh, .github/workflows/cut-release-branch.yml, .gitignore (.clj-kondo allowlist)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-master-only/c9045469-07ff-4c1b-9aa3-3409dcf38ae9.jsonl
    lines: 6-385
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.84, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.43, codebase_trap: 0.84, flailing: 0.49, env_friction: 0.81}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-master-only/c9045469-07ff-4c1b-9aa3-3409dcf38ae9.jsonl
    lines: 340-728
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.85, misleading_signal: 0.88, user_correction: 0.70, codebase_trap: 0.86, flailing: 0.26, env_friction: 0.95}
---
## Summary
PR #81033 ("Use kondo ratchets on master only") made the release-branch cut drop `.clj-kondo/ratchets.edn` and made `create-backport` resolve the resulting modify/delete conflicts. Review plus scratch-repo simulation turned up four environment quirks. Each fails silently or exits 0 locally and only bites in CI:
1. **Sparse checkout.** The cut workflow checks out `master` with `sparse-checkout: release, .github`. There, `git rm -q --ignore-unmatch .clj-kondo/ratchets.edn` exits 0 and removes nothing, because the path is outside the cone. It needs `git rm --sparse`, which also stages removals of out-of-cone paths. `git add --sparse` is the mirror.
2. **Emptied cherry-pick.** When the backported commit touched only `ratchets.edn`, dropping the file leaves nothing to apply. `git cherry-pick --continue` then exits 1 ("The previous cherry-pick is now empty"). Composite action steps run `bash --noprofile --norc -eo pipefail`, so the step dies with "Something went wrong while creating backport". Fix: `git commit --allow-empty --no-edit` when `git diff --cached --quiet HEAD`.
3. **`echo` in the generated `backport.sh`.** The PR changed its shebang to bash. Bash's `echo` does not interpret `\n` (sh/dash's does), so the "Resolve conflicts ..." guidance printed on one line. Fix: `echo -e` (now `printf`).
4. **`.gitignore` allowlist.** `.gitignore` ignores `**/.clj-kondo/*` except an explicit allowlist. A new marker file `.clj-kondo/ratchets-disabled` would have made `git add --sparse` exit 1 and killed the cut workflow. `git status` never shows the file, so local testing passed. roborev caught it (round 2, L380-386).

## Symptom
- L80-81 (scratch repo): `CONFLICT (modify/delete): .clj-kondo/ratchets.edn deleted in HEAD and modified in 39f8f6b`.
- L89-90: ratchets-only cherry-pick -> after `git rm`, `cherry-pick --continue` -> `nothing to commit, working tree clean` / `continue exit=1`.
- L227-229: `bash -eo pipefail` demo: `in f` / `exit=1`.
- L97-99: `echo "...\n\nTo backport..."` under bash prints literal `\n`; under `sh` it prints newlines. (Also `cat -A` -> `cat: illegal option -- A` on macOS.)
- L254-256: `git rm -q --sparse --ignore-unmatch` out of cone -> `REMOVED from index`. Without `--sparse` the original line was a silent no-op.
- L380-386: roborev High: "`.clj-kondo/ratchets-disabled` is ignored by the existing `**/.clj-kondo/*` rule". `git check-ignore -v` -> `.gitignore:154:**/.clj-kondo/*`.
- L312: scratch fixture: `(eval):8: no such file or directory: .clj-kondo/ratchets-disabled`. `git rm` had removed the now-empty `.clj-kondo/` dir, so the workflow's `mkdir -p` is load-bearing.

## Timeline
- L37-44: roborev and `/code-review` launched. (`Workflow "code-review" not found` at L40; the agent reached for the Workflow tool before Skill.)
- L76-94: scratch-repo simulation of the backport flow.
- L246: review drafted.
- L249 USER: "lets spin this around, rather than reviewing i want you to iterate on applying your fixes, and getting roborev to converge".
- L254-267: verifies `--sparse` semantics and the marker approach in scratch repos.
- L311-330: three backport shapes simulated under `set -e`.
- L367-376: commits 41da43b147a (marker), dbf85d3486a (empty backport + echo -e).
- L380-404: roborev round 2 finds the gitignore problem. Negation added (00721551e5e).
- L407-408: round 3, "No issues found".

## Root cause
Git's sparse-checkout and cherry-pick sequencer semantics, GHA's composite-step shell flags, and bash-vs-sh `echo` are all documented but unintuitive. The repo's `.clj-kondo/` allowlist gitignore is a local convention nothing surfaces. Every failure mode is "exit 0, did nothing" locally or "exit 1 only under -e".

## Why agents fall for it
- `--ignore-unmatch` is added to make removal robust, and it also hides the no-op.
- Local simulation usually runs without `-e` and without sparse checkout.
- `git status` hides ignored files, so "wrote the marker, committed" looks fine locally.

## Current state
- Design since changed: the marker file was dropped. Release branches now carry an explicit opt-out inside `ratchets.edn` itself (`{:disabled true}`), written by `.github/actions/create-backport/kondo-ratchets.sh:7-14` (`write_disabled_ratchets`) and used by `cut-release-branch.yml:75-77` (`git add --sparse .clj-kondo/ratchets.edn`).
- The emptied-pick handling is at `kondo-ratchets.sh:31-40` (`git commit --allow-empty --no-edit`, `GIT_EDITOR=true git cherry-pick --continue`). `write_backport_script` now uses `printf` (`kondo-ratchets.sh:~75`).
- The `.gitignore` allowlist trap still exists in general (`.gitignore:158` `**/.clj-kondo/*`, negations at 159-165). It is documented in memory `reference_clj_kondo_dir_gitignore_allowlist.md`, which this session wrote (L615) after hitting it.

## Suggested fix
- Keep the helper-script pattern: one sourced `kondo-ratchets.sh` with bats-style tests running under `bash -eo pipefail` and a sparse clone.
- Add a comment on `.gitignore:157` ("new tracked files under .clj-kondo need a negation below").
- CI check: `git ls-files -o -i --exclude-standard .clj-kondo` should be empty after the cut step's dry run.

## Detection signal
- Workflow or action YAML using `git rm ... --ignore-unmatch` in a job with `sparse-checkout:`.
- `git cherry-pick --continue` with no empty-commit branch in a `shell: bash` step.
- `echo ".*\\n` in generated bash scripts.
- `git add` of a new path under an allowlist-ignored directory: `git check-ignore` hit.

## Raw excerpts
```
L263 --- continue (expect fail) ---
The previous cherry-pick is now empty, possibly due to conflict resolution.
If you wish to commit it anyway, use:
--- fallback: git commit --allow-empty --no-edit ---
[rel c61eff1] ratchets only
```
```
L391 --- add --sparse an ignored file ---
The following paths are ignored by one of your .gitignore files:
.clj-kondo/ratchets-disabled
hint: Use -f if you really want to add them.
exit=1
```
```
L431 `41da43b147a` — ... Also dropped `.clj-kondo` from the cut workflow's sparse-checkout list in favour of `git rm --sparse` / `git add --sparse` — without that list entry the old `git rm -q --ignore-unmatch` exited 0 and removed nothing.
```

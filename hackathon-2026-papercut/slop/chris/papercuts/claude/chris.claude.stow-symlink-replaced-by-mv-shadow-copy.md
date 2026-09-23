---
title: Stow per-file symlinks silently replaced by real files (write-temp-then-mv), so edits to skills/voice-samples and shell config landed on untracked shadow copies for months
slug: stow-symlink-replaced-by-mv-shadow-copy
kind: env-friction
impact: both
severity: high
status: fixed
area: ~/dotfiles stow packages (agents, bin, zsh, zed) -> ~/.claude/skills/*, ~/bin, ~/.zshrc, ~/.zshenv; sound-less-like-an-ai skill "append to voice-samples.md in this directory"
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/bc4e47b6-6b1e-4a41-84b4-440e15655cc0.jsonl
    lines: 698-1065
    date: 2026-09-22
    jev: {self_inflicted_bug: 0.93, tool_misuse: 0.94, misleading_signal: 0.74, user_correction: 0.52, codebase_trap: 0.53, flailing: 0.71, env_friction: 0.97}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/58ea02b2-4677-4a04-ac01-d6ef1c7624e4.jsonl
    lines: 226-341
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.86, tool_misuse: 0.93, misleading_signal: 0.64, user_correction: 0.70, codebase_trap: 0.53, flailing: 0.39, env_friction: 0.83}
---
## Summary
Chris's skills and tools are stowed from `~/dotfiles` with `--no-folding` (because `~/.claude/skills` and `~/bin` also hold non-dotfiles content), so each file is an individual symlink. `sound-less-like-an-ai/SKILL.md` tells agents to append corrections to "voice-samples.md in this directory". At some point a write-temp-then-`mv` replaced the `voice-samples.md` symlink with a regular file. Every later append (about a month of voice corrections, 4 entries) went to the untracked shadow; the agent in bc4e47b6 first reported the file as "unversioned" (wrong: it was tracked and shadowed). A detector the agent wrote then found four more shadows: `~/.zshrc` (live ahead by 13 lines), `~/.zshenv` (the repo version, with a brew PATH fix for non-interactive ssh shells, had *never executed* since Aug 29 because a March copy shadowed it), `~/.config/zed/settings.json`, `~/bin/review-requests`.

## Symptom
- L703/L706 agent: "`voice-samples.md` is a real file in an unversioned directory — three months of corrections with no git behind it."
- L759/L768 after moving it into dotfiles: `git add` reports `M` not `A`. "Correction to what I told you earlier — the file was already tracked in dotfiles."
- L780: dotfiles copy 38 entries / 633 lines vs shadow 42 / 673.
- L784 user: "how do we stop updating the wrong file in future".
- L806-810 experiment: `>>`, `>`, `cp`, `tee`, python `write_text` follow the link; macOS `sed -i` refuses ("in-place editing only works for regular files"); Claude Code Write tool refuses ("Refusing to write ...: it is a symbolic link"); **`mv` over it replaces the symlink**.
- L856 `check-dotfile-shadows` first run: 4 shadows, 3 with content drift. L915 clean non-interactive zsh: `brew NOT visible`.

## Timeline
- L698 user asks to send skill-rewrite to codex; L702 agent inspects real paths.
- L747-759 moves voice-samples into dotfiles, symlinks back, commits.
- L768-780 discovers it was a shadow, not untracked.
- L793-810 isolates `mv` as the only culprit.
- L830 proposes: fold the skill directory into one symlink; point the skill's write instruction at the repo path; add a shadow detector.
- L851-875 writes `~/dotfiles/bin/bin/check-dotfile-shadows`; first version advised "the copy is usually ahead" -> `mv <live> <repo>`, which on `.zshenv` would have overwritten the good repo file with the stale March one (L870); corrected to "establish which side is ahead".
- L924-1021 reconciles .zshenv (merge), .zshrc (live -> repo), zed (repo + live prefs); 0 shadows, 95 linked.
- 58ea02b2 L226-341 (related stow trap): adding `bin/src/review-requests-2.lis` inside the `bin` stow package would have linked `~/src/review-requests-2.lis` on the next `install.sh`; caught by `stow -n -v` dry run, source moved to top-level `src/`.

## Root cause
Per-file stow links are fragile against atomic-rename writers (editors, some tools, `mv`). Nothing reports that a link has become a file. The skill's own instruction resolves through the fragile link.

## Why agents fall for it
`~/.claude/skills/<name>/file` looks like the canonical path; the Read tool follows symlinks transparently, so a shadow reads identically. `ls -l` is the only tell.

## Current state
Fixed for these files: `~/.claude/skills/sound-less-like-an-ai` and `~/.claude/skills/precis` are now directory symlinks into `~/dotfiles/agents/.claude/skills/` (verified `ls -la`, 2026-09-23). `~/bin/check-dotfile-shadows` exists. Other per-file-linked skills and `~/bin` scripts remain exposed. Zed rewrites `settings.json` itself and may re-break it.

## Suggested fix
- Fold every dotfiles-owned skill directory (not just two).
- Run `check-dotfile-shadows` from the dotfiles sync / a SessionStart hook.
- Skill instructions that append to files should name the repo path (`~/dotfiles/agents/...`).

## Detection signal
Transcript: `git add` of a "new" file prints `M`; `readlink -f` of a skill file not under `~/dotfiles`; a write to `~/.claude/skills/**` via `mv`. Tool: periodic shadow scan comparing `git ls-files` in each stow package with live paths.

## Raw excerpts
```
L807   shell >> append        symlink SURVIVED
  shell > truncate       symlink SURVIVED
  sed -i (macOS)         symlink SURVIVED   (refused: in-place editing only works for regular files)
  cp over it             symlink SURVIVED
  mv over it             *** SYMLINK REPLACED by real file ***
  python write_text      symlink SURVIVED
  tee                    symlink SURVIVED
L856 SHADOW   /Users/christruter/.zshenv  shadows /Users/christruter/dotfiles/zsh/.zshenv  content differs
     90 linked, 4 shadowed, 54 not stowed
L915 env -i HOME="$HOME" /bin/zsh -c ... -> PATH=/Users/christruter/.cargo/bin:/bin:/usr/bin:/usr/ucb:/usr/local/bin  brew NOT visible
```

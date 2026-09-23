# Snapshot runs left unignored temporary data in the worktree

Source: Codex session 2026-08-03, [transcript](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T14-46-54-019fc7a9-ae8d-7430-9f45-727a4021dd95.jsonl).

Observed failure: repeated snapshot work left roughly 15 untracked `.snapshots-*` directories ([line 45](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T14-46-54-019fc7a9-ae8d-7430-9f45-727a4021dd95.jsonl#L45)). The user asked whether subsequent runs would keep creating more and whether a broad `git add` could accidentally commit snapshot data ([lines 2591–2611](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T14-46-54-019fc7a9-ae8d-7430-9f45-727a4021dd95.jsonl#L2591)).

Mechanism: `.gitignore` covered `.snapshots/` but not the suffixed temporary directory names, while `snapshots/__main__.py` used `REPO_ROOT/.snapshots` as its default root ([lines 2616 and 2656](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T14-46-54-019fc7a9-ae8d-7430-9f45-727a4021dd95.jsonl#L2616)). Temporary paths looked like ordinary untracked project files to Git and to agents.

Recorded repair: the later session report describes a portable shared staging home, publish/prune handling, an artifact guard, and focused tests ([line 2803](/Users/christruter/.codex/sessions/2026/08/03/rollout-2026-08-03T14-46-54-019fc7a9-ae8d-7430-9f45-727a4021dd95.jsonl#L2803)).

Classification: confirmed workflow papercut; repeated cleanup cost and risk of committing generated data.

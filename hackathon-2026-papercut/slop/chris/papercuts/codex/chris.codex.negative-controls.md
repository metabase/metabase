# Negative controls for a papercut classifier

These are deliberately selected non-cases. They help test whether a classifier distinguishes underlying code/tool traps from ordinary requests or preference changes. Jev scores are screening outputs, not gold labels; the judgments below follow source review.

## Administrative follow-up, no code trap

Claude Code session [`b996ba34-7d32-459d-a1bd-b789677909bc`](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/b996ba34-7d32-459d-a1bd-b789677909bc.jsonl), Jev 0.18. The user asked whether BOT-2077 remained relevant, then changed how it should be organized in Linear ([lines 5, 113 and 138](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/b996ba34-7d32-459d-a1bd-b789677909bc.jsonl#L5)). The assistant read the issue and updated its parent/assignment/scope. This contains user steering and work, but the excerpted sequence has no evidence of an agent being misled by code or a tool and repairing a resulting bug.

## Post-hoc issue creation, no agent stumble

Codex session [`01a0abf5-44bd-7053-ad03-9bc768524a28`](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T16-42-53-01a0abf5-44bd-7053-ad03-9bc768524a28.jsonl), Jev 0.10. The user asked for a closed Linear issue, assigned to them, for an already-merged Astra support PR ([line 7](/Users/christruter/.codex/sessions/2026/09/16/rollout-2026-09-16T16-42-53-01a0abf5-44bd-7053-ad03-9bc768524a28.jsonl#L7)). This is normal bookkeeping. A classifier should not infer a papercut solely from a bug-tracker workflow.

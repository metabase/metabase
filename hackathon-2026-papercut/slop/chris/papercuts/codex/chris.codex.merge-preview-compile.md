# Namespace move passed locally but broke the merge preview

Source: Claude Code session `44d740f8-47f4-42f8-b6af-2964dbacf800`, [transcript](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl). Jev screening probability: 0.87, followed by source review.

Observed failure: a branch moved `dashboard->resolved-params` from its old namespace. Local branch checks passed and the change was pushed. The merge-preview CI then had 64 failing checks, including builds, lint, and driver jobs, because `metabase/mcp/v2/projections.clj` still called the old `dashboard/dashboard->resolved-params` var ([lines 924–966](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl#L924)).

Mechanism: `projections.clj` did not exist in the branch worktree. It arrived on master after the branch's rebase and before CI built the merge preview. A search of the branch could not find the new caller; a local branch compile therefore could not catch the semantic conflict. The agent established this after initially blaming its own consumer grep for missing an old-namespace caller ([line 983](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl#L983)).

Recorded repair: the agent fetched/rebased on current master, repointed the caller to the new namespace, and ran `clojure -M:ee:drivers:load-namespaces`, the check that surfaces this class of error. It reported the fix committed and later pushed ([lines 993–1170](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl#L993)).

Additional rework in the same session: moving code had also lost several explanatory comments, including a c3p0 deadlock warning next to a `locking` call. The user spotted the loss and the agent restored five comments ([lines 796–910](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl#L796)).

Classification: confirmed integration papercut; source-only local verification did not represent the merge-preview tree, and widespread CI failures obscured one stale reference.

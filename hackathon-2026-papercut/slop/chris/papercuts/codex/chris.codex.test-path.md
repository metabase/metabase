# Test PATH hid a dependency installed by mise

Source: Claude Code session `253f6689-2454-43e0-b1df-dece373b153a`, [transcript](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl).

Observed failure: five data-stack tests failed on macOS while the user had `jq` installed. The tests replaced `PATH` with `<tmp>/bin:/usr/bin:/bin`; the fake bin held only `aws`, and the user's mise-installed `jq` was outside those directories. The script then failed with `jq: command not found` and `NAMES: unbound variable` ([line 2450](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl#L2450)). On Linux CI, `jq` was in `/usr/bin`, so CI did not reveal the portability problem.

Agent trap: the initial report treated the five failures as unrelated local-environment failures after confirming they also occurred on untouched main ([lines 2395–2400](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl#L2395)). The user's “jq is installed” correction forced inspection of the test's altered environment ([line 2446](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl#L2446)).

Recorded repair: the test appended the directory from its existing `shutil.which("jq")` lookup while preserving prior PATH order, and the full 1,305-test data-stack suite passed locally ([line 2486](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl#L2486)).

Classification: confirmed test-environment papercut; platform-specific false failure and agent investigation detour.

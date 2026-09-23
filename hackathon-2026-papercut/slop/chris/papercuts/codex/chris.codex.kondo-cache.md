# Cache-dependent Clj-Kondo hook was silent in CI

Source: Claude Code session `a42e9e59-56fc-4f44-8f9e-833d9d1dba2c`, [transcript](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl).

Observed failure: the user found that `:metabase/prefer-with-dynamic-fn-redefs` warned only when Clj-Kondo's cache already knew the redefined var was a plain function. `./bin/mage kondo` deleted `.clj-kondo/.cache` before linting, so the CI Clj-Kondo job reported zero warnings even though the offending form was on master and a new instance had been added. A warm local editor cache did report both. The user's opening diagnosis is detailed in [line 6](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl#L6).

Mechanism: the rule's dependency on cached var analysis was not part of the apparent lint contract. A clean CI run gave agents false assurance, while a warm local environment disagreed. Later work added a warm pass and a completion marker; the transcript records fixes to marker lifecycle after bot review ([lines 1734 and 1814](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl#L1734)).

Secondary rework: the marker's freshness semantics generated repeated reviewer findings. A code comment eventually documented that a completed warm pass may be reused for local speed, while `mage kondo` clears and warms on every CI run; the subsequent roborev review found no issue ([line 1965](/Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl#L1965)).

Classification: confirmed tooling papercut; environment-sensitive false negative plus repeated review churn from undocumented cache semantics.

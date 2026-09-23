---
title: The display types Metabot and the Agent API accept were hand-copied into several enums, so a new chart type lands in some lists and not others and the model silently loses it on one surface
slug: chart-display-type-lists-hand-copied
kind: codebase-trap
impact: introduced-bug
severity: medium
status: open # the Metabot chart and document tool enums now derive from shared/chart-types on master, but the Agent API ::card-display enum is still a separate list without boxplot, treemap or object
area: src/metabase/metabot/tools/shared.clj (chart-types); metabot tools charts.clj, charts/create.clj, charts/edit.clj, document.clj; src/metabase/agent_api/api.clj (::card-display); frontend cardDisplayTypes
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501/subagents/agent-a18d8af069b9210f8.jsonl
    lines: 191-256
    date: 2026-08-27
    jev: {any_papercut: 0.60, env_toolchain: 0.10, stale_state: 0.09, verify_mismatch: 0.15, misleading_code: 0.33, hidden_coupling: 0.70, stale_docs: 0.49, tool_footgun: 0.20, flaky: 0.08, agent_bug: 0.88, wasted_effort: 0.23, user_correction: 0.95}
---
## Summary
Adding box plot support to Metabot meant touching four separate Malli enums of chart types, which had already drifted: an earlier change added treemap to three of them and missed the document tool, whose enum dated from an earlier port. A fifth list in the Agent API still lacked boxplot, treemap and object, so external agents got a 400 for charts the product renders. The agent consolidated the four Metabot lists into one shared var and had to prove Malli and JSON-schema identity to show the refactor changed nothing else; the Agent API list was left for a follow-up ticket.

## Symptom
Coordinator summary of the review (L191): the four old sets evaluated to 20/19/20/20 entries, `document.clj` the odd one out. Per the parent transcript (L420), `document.clj`'s enum came from an earlier port, and a later change added treemap to only the other three files. A revert test on `document.clj` failed with the old enum visibly missing treemap (L256 report).

## Timeline
- Earlier in this subagent (chunk .0): four enums found, consolidated into a shared list plus boxplot.
- L191: independent review confirms the union, identity of the generated JSON schema, and the drift history; asks for a missing document-tool test.
- L199-L210: the new document test fails against the old enum (`got: "treemap"`), proving the drift was a live bug.
- Parent L565-L668: the fifth list in the Agent API (`::card-display`) is verified and filed as a separate ticket.
- Cost: a refactor plus a review round spent proving the consolidation was behaviour-neutral; a real user-visible gap (treemap in document charts, three types in the Agent API) that shipped earlier because one list was missed.

## Root cause
The same model-facing set of display strings was declared as independent `[:enum ...]` literals per tool and again in the Agent API, with no shared source and no test that they match each other or the frontend's `cardDisplayTypes`.

## Why agents fall for it
An agent adding a display type greps for a neighbouring value and edits the hits; a list that differs in shape or lives in another module (the Agent API) is easy to miss, and every individual list still validates, so tests stay green.

## Current state
Checked origin/master: `metabase.metabot.tools.shared/chart-types` now feeds the chart and document tool enums; `src/metabase/agent_api/api.clj` still defines `::card-display` as its own `[:enum "table" "bar" ... "sankey"]` without boxplot, treemap or object.

## Suggested fix
- Derive `::card-display` from the same shared list (minus deliberate exclusions, stated in code).
- Add one test asserting every Metabot or Agent API display list is a subset of the frontend's registered display types and that the lists agree.

## Detection signal
A diff adding a display-type string to some `[:enum` literals but not all files containing sibling display strings; Agent API 400s for display values the UI renders.

## Raw excerpts
```
L205 [CALL] Bash: cd ~/src/mb/wt/<branch> && git checkout HEAD^ -- src/metabase/metabot/tools/document.clj && eval "$(mise activate zsh --shims)" && clojure -X:dev:test :only '[metabase.metabot.tools.document-test]' 2>&1 | grep -A8 "ERROR in\|Uncaught exception\|assertions" | head -30
L206 [RESULT] Uncaught exception, not in assertion. | clojure.lang.ExceptionInfo: Invalid input: {:viz_settings {:chart_type ["should be either \"table\", \"bar\", \"line\", \"pie\", \"sunburst\", \"area\", \"combo\", \"row\", \"pivot\", \"scatter\", \"waterfall\", \"sankey\", \"scalar\", \"smartscalar\", \"gauge\", \"progress\", \"funnel\", \"object\" or \"map\", got: \"treemap\""]}}
```

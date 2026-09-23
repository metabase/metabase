---
title: Metabot's chart-type list offers "sunburst", which is not a card display, and the frontend silently renders any unknown display as a table, so agents guessed wrong about what happens and a bogus display persists without an error
slug: unknown-card-display-falls-back-to-table
kind: codebase-trap
impact: wasted-time
severity: medium
status: open # shared/chart-types on master still lists "sunburst", and viz-core/lib/registry.ts still returns the default visualization for unknown displays
area: src/metabase/metabot/tools/shared.clj (chart-types); frontend/src/metabase/viz-core/lib/registry.ts (visualizations.get fallback; was visualizations/lib/registry.ts); frontend visualizations/echarts/pie/option.ts
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501/subagents/agent-a18d8af069b9210f8.jsonl
    lines: 233-278
    date: 2026-08-27
    jev: {any_papercut: 0.60, env_toolchain: 0.10, stale_state: 0.09, verify_mismatch: 0.15, misleading_code: 0.33, hidden_coupling: 0.70, stale_docs: 0.49, tool_footgun: 0.20, flaky: 0.08, agent_bug: 0.88, wasted_effort: 0.23, user_correction: 0.95}
---
## Summary
While consolidating Metabot's chart-type lists, an agent grepped the frontend display registry and `cardDisplayTypes` for "sunburst", found nothing, and wrote into a guide and PR text that a model picking it produces a card that cannot render; the coordinator then proposed a ticket saying the Agent API wrongly rejects sunburst. Both were wrong: in this codebase "sunburst" is an echarts series type inside the pie chart (multi-ring pies), not a display, and `visualizations.get` falls back to the default visualization for any unknown key, so the model reports success and a saved card silently renders as a table. An adversarial verification pass caught it before the tickets were filed.

## Symptom
L233-L236: grep of `visualization.ts` and `register.ts` for sunburst returned nothing and the agent took that as confirmation that sunburst does not exist. L257: the coordinator's correction: `registry.ts:45-51` patches `visualizations.get` to fall back to the default visualization, so it does render, as a plain table. L265-L270: sunburst appears only in pie chart code (`echarts/pie/option.ts:377: type: "sunburst"`).

## Timeline
- L233-L236: grep-based check, claim written into the guide and PR text.
- Parent L565: coordinator lists missing boxplot, treemap, sunburst and object displays as a ticket to file.
- Parent L572: user asks for a triple check that the issues are real.
- Parent L623-L634: verification agent (about 14 minutes) finds the fallback and the pie-series meaning; two of three claims corrected.
- L257-L278: this agent re-verifies, rewrites two guide paragraphs and the PR text.
- Cost: a verification run, a correction round on the guide and PR description, and a near miss of filing a ticket asking to add a display that should not exist.

## Root cause
"sunburst" was carried in every Metabot chart-type enum although no card display of that name exists; the word is used in the frontend only for the pie chart's echarts series. The registry's `visualizations.get` returns `defaultVisualization` for unknown keys, so nothing errors when a card has an invalid display, and no backend validation compares Metabot's list with the registered displays.

## Why agents fall for it
Grepping the registry for a display name is the natural existence check, and the absence reads as "cannot render". The silent fallback is a patched `Map.prototype.get` in a registry file an agent has no reason to read, and "sunburst" genuinely appears in visualization code, which makes it look like a real display.

## Current state
Checked origin/master: `chart-types` in `src/metabase/metabot/tools/shared.clj` still contains "sunburst"; `frontend/src/metabase/viz-core/lib/registry.ts` still returns `defaultVisualization` from `visualizations.get` for unknown displays.

## Suggested fix
- Remove "sunburst" from `chart-types` (a multi-ring pie is `pie` with more breakouts).
- Validate Metabot and Agent API display values against the frontend's `cardDisplayTypes` in a shared test.
- Log a warning (or show a notice in dev) when `visualizations.get` falls back for an unknown display, so bogus displays are visible.

## Detection signal
Cards saved with a `display` not in `cardDisplayTypes`; agent claims that an unknown display "cannot render"; grep-only existence checks against the visualization registry.

## Raw excerpts
```
L233 [CALL] Bash: cd ~/src/mb/wt/<worktree> && grep -rn "boxplot" frontend/src/metabase/static-viz/components/StaticVisualization/StaticVisualization.tsx | head -3; grep -n "cardDisplayTypes" frontend/src/metabase-types/api/visualization.ts | head -2; grep -n "sunburst" frontend/src/metabase-types/api/visualization.ts frontend/src/metabase/visualizations/register.ts | head -3
L234 [RESULT] frontend/src/metabase/static-viz/components/StaticVisualization/StaticVisualization.tsx:52: case "boxplot": | 19:export const cardDisplayTypes = [ | 46: cardDisplayTypes.includes(value as CardDisplayType);
L266 [RESULT] frontend/src/metabase/visualizations/visualizations/PieChart/use-chart-events.ts | ... | frontend/src/metabase/visualizations/echarts/pie/option.ts:377: type: "sunburst",
L270 [RESULT] 45:visualizations.get = function (key) { | visualizations.get = function (key) { | return ( | Map.prototype.get.call(this, key) || | aliases.get(key) || | defaultVisualization | ); | }; | 73:A fifth list exists outside the metabot module ... a model picking it produces a card the frontend cannot render as such.
```

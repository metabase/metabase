# 63416: visualizer dashcard download ignores dashboard filters

Status: **retired, masked by a later fix**. The entry was reclassified from `live` to retired: the two-line mutant fails the hint test, but only because it also undoes #75720's change to the download menu, which brings back #71638 and #64333 too. Base `8317274709c`. The two-line pre-fix restoration is kept as a wiring mutant for the kill matrix, not as this regression.

## Where the code is now
The fix (92cea5d4f55, #64754) added `json_query: rawSeries[0].json_query` to the series `DashCardVisualization` builds for visualizer dashcards, because the dashcard menu passed `series[0]` as the download `result` and `getInternalDashcardParams` reads `result.json_query.parameters`. The line is still there (`DashCardVisualization.tsx:323`).

daef67027c2 (#75720, metabase#71638, June 2026) changed the menu's result to `cardResult ?? series[0]`, where `cardResult` is the source card's own dataset and carries `json_query` directly. 3b6a98b66bc (#80113, metabase#64333) built the menu's permission gating on the same `cardResult`. So at HEAD the 63416 line is redundant for downloads: removing it alone changes nothing a user sees. #75720 is an ancestor of July's base, so July's one-line mutant was already equivalent in July, which is why no real test ever killed it. July's recorded kill (`LogLevelsModal.unit.spec.tsx`) passes 8/8 in isolation on July's mutant: a load flake.

## Mutant (2 lines, `DashCardVisualization.tsx`)
Drops the `json_query` line and reverts the menu result to `series[0] as unknown as Dataset`, the exact pre-#75720 line. Together they restore the pre-fix download path and the POST goes out with `parameters: []`. Caveat: the second line also brings back #71638 and #64333, whose existing tests fail on the mutant too. No single-line change at HEAD restores the 63416 behaviour, because two independent guards now cover it.

## Oracle (new, `witness.patch`)
`Dashcard.unit.spec.tsx` › "should include dashboard filters when downloading a single-source visualizer dashcard as csv (metabase#63416)". Clean, twice: 37/37. Mutant, twice: 3 failed, 34 passed; the 63416 test fails at line 648 on `parameters`, received `[]`. The POST reached the exact URL; only the body differs.

## Variants
- variant-1, July's one-liner: **survive**, whole spec green, equivalent at HEAD.
- variant-2, menu precedence reverted only: **survive** for this oracle; the #71638 and #64333 tests kill it.
- variant-3, precedence reverted and the series copies `dashcard.card.dataset_query`: **kill**.

## Why retired rather than live
The bug as reported can no longer occur at HEAD without also reintroducing two later-fixed bugs that existing tests guard. For the deletion question, the 63416 e2e test has no unique bug left to catch. The two-line mutant is useful as a wiring mutant (menu reads the wrong result object) and is registered as such.

## Traps
- Rendering the visualizer `line` card logs a caught `Error getting setting graph.series_order` warning on clean HEAD; harmless. Typed mock columns (`source: "breakout"/"aggregation"`) make the menu disappear; leave them untyped.

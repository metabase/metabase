# sadness.md

The sub-modules work (snapshots 01 → 10) reshaped the dependency graph, but
did **not** shrink the test blast radius. Across every snapshot, the median
module still transitively pulls in ~every test in the repo.

## Headline: the median is pegged

`num-test-files-affected` per module:

| file | n-mod | mean | p10 | p25 | **p50** | p75 | max | % below max |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 01.before                 | 175 | 659.1 | 21 | 23 | **1183** | 1183 | 1183 | 45.1 |
| 02.nested-modules         | 175 | 663.7 | 23 | 25 | **1190** | 1190 | 1192 | 99.4 |
| 03.circular-deps          | 186 | 682.2 | 23 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 04.circular-deps-final    | 188 | 687.6 | 23 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 05.circular-deps-final    | 192 | 698.1 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 06.final                  | 194 | 703.1 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 07.final                  | 197 | 710.6 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 08.connectedness          | 197 | 710.6 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 09.final                  | 199 | 698.0 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |
| 10.api-context-fix        | 199 | 698.0 | 24 | 25 | **1190** | 1190 | 1192 | 99.5 |

- Median moved **1183 → 1190** once (file 02), then never budged.
- p75 equals the median everywhere — more than half of modules hit the "run
  everything" bucket.
- The `below-max%` jump from 45% → 99.5% at file 02 is cosmetic: one module
  became slightly more connected than the rest (1192 vs 1190), so every other
  module dropped from "=max" to "max−2". Nothing structural changed.

## Other aggregations (all equally flat)

Medians of `num-test-files-affected` under different weightings:

| file | per-module | ns-weighted | src-weighted | top-level (group by first segment, max within group) |
|---|---:|---:|---:|---:|
| 01.before              | 1183 | 1183 | 1183 | 1183 |
| 02.nested-modules      | 1190 | 1190 | 1190 | 1190 |
| 03.circular-deps       | 1190 | 1190 | 1190 | 1190 |
| 04.circular-deps-final | 1190 | 1190 | 1190 | 1190 |
| 05.circular-deps-final | 1190 | 1190 | 1190 | 1190 |
| 06.final               | 1190 | 1190 | 1190 | 1190 |
| 07.final               | 1190 | 1190 | 1190 | 1190 |
| 08.connectedness       | 1190 | 1190 | 1190 | 1190 |
| 09.final               | 1190 | 1190 | 1190 | 1190 |
| 10.api-context-fix     | 1190 | 1190 | 1190 | 1190 |

No slicing moves the median. Namespace weighting, source-file weighting, and
top-level grouping all report the same pegged value because the "affects
everything" cluster dominates under every weighting.

## 01 vs 10 at a glance

| metric | 01.before | 10.api-context-fix | Δ |
|---|---:|---:|---:|
| modules                         | 175    | 199    | +24 |
| leaf / root                     | 4 / 12 | 7 / 13 | +3 / +1 |
| source files (sum)              | 1624   | 1627   | +3 |
| direct deps (sum)               | 1776   | 2007   | +231 |
| direct deps (avg)               | 10.15  | 10.09  | −0.06 |
| transitive deps (sum)           | 16,931 | 22,634 | +5,703 |
| transitive deps (avg)           | 96.75  | 113.74 | +17.0 |
| max depth                       | 20     | 20     | 0 |
| depth (avg)                     | 14.94  | 13.47  | −1.47 |
| circular deps (sum)             | 88     | 56     | −32 |
| declared API nss                | 480    | 487    | +7 |
| derived API nss                 | 532    | 539    | +7 |
| unexpected API nss              | 266    | 305    | +39 |
| declared friends                | 26     | 20     | −6 |
| **median tests affected**       | **1183** | **1190** | **+7** |

Circular deps are down 36%, average depth is ~1.5 shallower, and depth mass
shifted out of 17–18 into 14–16. Real graph improvements — that just don't
show up in the blast-radius median.

## Why the median didn't move

`num-test-files-affected` is a *transitive* measure. A module affects a test
file if any transitive dependent reaches that test. As long as one giant
connected component sits upstream of ~every test namespace, every module
inside or upstream of that cluster still reports the full count.

Splitting a module inside the cluster adds nodes but doesn't sever the
cluster — the new children inherit the same transitive closure. That's
exactly what we see: 24 new modules, same median.

## What would actually move the median

Something needs to **partition** the 1190-test cluster — cut an edge whose
removal drops the transitive closure for a large fraction of modules.
Candidates worth looking at:

- the remaining 56 circular dependencies (down from 88 but still load-bearing
  cycles keep everything connected);
- the 305 unexpected API namespaces (up from 266 — new splits exposed more
  internals as de-facto API, which likely keeps the cluster cemented);
- whatever upstream module(s) every test-bearing namespace reaches through.
  Until one of those is carved out, per-module test selection won't help in
  CI.

## TL;DR

- 10 snapshots of refactoring
- 24 new modules, 32 fewer circular deps, flatter depth distribution
- median tests-to-run: **1183 → 1190**
- under every slicing (per-module, namespace-weighted, source-weighted,
  top-level): still 1190
- the giant component is untouched; the sadness persists

## Update 2026-06-11: SCC analysis — measuring the blob and scoring the cuts

The metrics above are all transitive-closure measures, which are step functions
over the giant strongly-connected component: they cannot move until the
component actually fragments, which is why ten snapshots showed a flat median.
New tooling in `dev.module-scc` (Tarjan SCC, condensation, cut scoring,
predicted blast radius) measures the component itself. Numbers below are from
the `nested-modules-07-metrics` worktree (178 declared modules, 1243 test
files; the pegged median here is 1236, not 1190, because the test-file count
grew since the snapshots).

### The blob, quantified

- **One giant SCC of 94 modules.** Only two other non-trivial SCCs exist:
  `{segments xrays}` and `{api-routes cloud-migration cmd}`. Everything else is
  cycle-free.
- `num-modules-in-cycles` (47) badly undercounts this — it only sees direct
  mutual edges. Half the blob participates in no 2-cycle but is still locked in
  by longer loops. SCC membership is the honest count.
- New continuous metrics now in `repo-metrics` / the per-module CSV:
  `largest-scc-size` (94), `sum-squared-scc-sizes` (8929 — Σ|C|², moves every
  time a cut shaves members off the blob even when the largest size doesn't),
  `scc-size` and `in-largest-scc?` per module.

### Cut scoring: make-it-pure-upstream

`upstream-cut-impacts` simulates the carving experiment for each blob member:
sever all of its out-edges that stay inside the SCC (i.e. invert its
back-references so it becomes a pure upstream module) and recompute. Top
candidates:

| module | back-edges to sever | new largest SCC | modules freed |
|---|---:|---:|---:|
| `settings` | 7 | 82 | 12 |
| `util` | **3** | 86 | 8 |
| `server` | 21 | 86 | 8 |
| `queries` | 28 | 90 | 4 |
| `enterprise/sso` | 12 | 90 | 4 |
| `driver` | 19 | 91 | 3 |

### Predicted blast radius per scenario

`predicted-test-blast-radius` applies the same module-granularity rule the
selective-CI helpers use, so it reproduces today's numbers on the real graph
(median 1236) and predicts a carve's payoff on a cut graph:

| carve | new largest SCC | median tests | mean tests |
|---|---:|---:|---:|
| (baseline) | 94 | 1236 | 688 |
| `util` | 86 | 1037 | 584 |
| `settings` | 82 | 1032 | 586 |
| `settings`+`util` | 82 | 1032 | 582 |
| `settings`+`util`+`server` | 74 | 1008 | 532 |
| + `queries` | 70 | **87** | 512 |
| + `driver` (instead) | 70 | **90** | 496 |
| `settings`+`util`+`server`+`queries`+`driver` | 66 | **60** | 477 |

The cliff is real and it has an address: `{settings, util, server}` plus
either of `{queries, driver}` collapses the median from ~1200 to ~90. Below
the cliff the *mean* still falls steadily (688 → 532), so progress is
measurable the whole way — use the mean and `sum-squared-scc-sizes` as the
experiment's tracking metrics, and expect the median to move only at the end.

### The first two carves are small

The module-level edges hide how cheap the first steps are. Requires that
would need inverting:

**`util` (3 edges, 7 requires)** — frees 8 modules, median → 1037:

- `util → classloader`: `metabase.util.i18n.impl`, `metabase.util.quick-task`
  require `metabase.classloader.core`
- `util → settings`: `metabase.util.date-2`, `metabase.util.retry`,
  `metabase.util.time.impl` require `metabase.settings.core`
- `util → system`: `metabase.util.embed`, `metabase.util.markdown` require
  `metabase.system.core`

All of a piece: util code reading settings/system state instead of taking it
as arguments. Pure-module hygiene, not architecture.

**`settings` (carved after util, ~7 requires)** — frees 12 modules,
median → 1032. Every remaining back-edge originates in
`metabase.settings.models.setting`(+`.cache`), one require each:
`metabase.api.common`, `metabase.app-db.core` (×2), `metabase.events.core`,
`metabase.models.serialization`, `metabase.premium-features.core`, and a
feature-gated `requiring-resolve` into
`metabase-enterprise.advanced-permissions.common` (a `defenterprise`
candidate). Carving util first matters: it removes `settings → util` (12
requires) from the must-sever list, since util is no longer in the blob.

Some of these aren't "bad" edges (settings legitimately persists via app-db);
the list is the menu of cycle participants, and each gets inverted (event,
protocol, defenterprise) or consciously accepted. But ~14 require-level
changes for median 1236 → 1032 and blob 94 → 82 is a far smaller experiment
than 'carve a module behind one `:api`' suggested.

### Sad no more (conditionally)

The blast-radius problem is no longer 'splitting didn't help' — it's a ranked
work list with predicted payoffs and a known cliff. The sadness was a
measurement artifact of watching a step function.

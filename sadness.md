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

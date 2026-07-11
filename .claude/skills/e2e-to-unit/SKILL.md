---
name: e2e-to-unit
description: Decide whether an e2e (Cypress) test could be a cheaper unit/component test instead, find the seam, draft the unit test, and verify it is as sharp as the e2e. Use when reviewing a new or existing *.cy.spec, triaging e2e coverage, or considering culling an e2e repro.
allowed-tools: Read, Grep, Glob, Bash, Skill
---

# e2e-to-unit triage

Given an e2e test (usually a `describe("issue NNNNN")` / `metabase#NNNNN` repro), decide if a
**cheaper test** can guard the same regression, and if so, draft + verify it. Grounded in a
27-bug study of the "only Cypress ever tested it" population: **~96% turned out unit-catchable**
(see `regression-corpus/E2E-ONLY.md`). "e2e-only" is usually a coverage gap, not a hard limit.

## The core move: trace the assertion back to its nearest pure seam

An e2e asserts a **downstream symptom**; the bug it guards is almost always a **computable value
upstream**. Find that seam and test there. Recurring seams (each row is a real corpus case):

| e2e asserts… | actual seam | how to unit-test | example |
|---|---|---|---|
| an element/marker is visible | a **count / boolean decision** | call the fn, assert the number/bool | 5369 (marker count 4 vs 2), 60534 (`shouldRender`) |
| light vs dark / a formatted value | a **pure fn** | assert the return | 66253 (`getColorSchemeFromDisplayTheme`), 60475 (`getTicksOptions`) |
| a button shows / sidebar closes / toggle persists | a **reducer / selector** | dispatch, assert next state | 51717 (`OPEN_QUESTION_INFO`), 56094 (`getIsVisualized`) |
| list refetches / request cancels | an **RTK-Query tag / abort** | mock fetch, assert refetch/abort call | 60241 (`invalidatesTags`), 64474 (`cancelQuery`) |
| correct page/tab after navigation | a **router query param** | in-memory router, assert `query.x` | 65501 (`page`), 44106 (`?tab=`) |
| a column / translation / error / overlay appears | **container DOM** | render + assert element/text | 63296 (translated header), 63176 (error state), 63070 (row-id column) |
| a value round-trips to the server | the **request body / params** | spy the request args | 70757 (SDK download `visualization_settings`) |

**Container renders are fair game** — jsdom handles them. For virtualized grids/tables, stub
layout with `mockGetBoundingClientRect()` + `jest.useFakeTimers()` so rows actually render
(63070, 67432). For API-driven components, `fetchMock` the endpoints with *differing* responses
so the assertion discriminates the real behavior (68378).

## The classifier: what is genuinely NOT unit-portable

Only a short list — do not force these down:
- **Real-browser geometry/measurement** — `scrollHeight`/`offsetHeight`/`getBoundingClientRect`
  driving the assertion. jsdom does no layout *and* jest strips CSS. Keep as e2e/visual. (63711)
- **Cross-page routing / full multi-page flows**, and **browser APIs jsdom lacks** (real clipboard
  paint, canvas, downloads).
- **Backend-computed values** → route to a Clojure `deftest`, **not** "irreducible" (68998).

**Sharp boundary — layout is only irreducible when it needs a *measurement*.** If the layout is
driven by a **JS-computed value** (an inline-style height from a pure fn), it IS unit-testable —
assert the computed value, not the pixels (69722: assert `16rem` vs `41rem`, not the overflow).

## Verify the unit test is as sharp as the e2e (don't skip this)

A drafted unit test is only trustworthy if it **fails when the guarded behavior breaks**. Use the
`mutation-testing` skill (or `regression-corpus/scripts/mutation-witness.md`): perturb the seam,
confirm the drafted test flips (pass on clean, fail on mutant). Run the same mutation against the
**e2e** too — if the e2e *passes* on the mutant, it is **vacuous** and the unit test is strictly
better (found in 4/24 corpus e2es, incl. a geometry test its unit witness beat: 67767, 69722).

## The honest caveat: logic vs wiring

A seam unit test replaces the **logic** coverage, not the **wiring** — it does not prove the real
flow actually *calls* that seam. So the verdict is one of:
- **Replace** — unit test covers it; the e2e repro is redundant (most cases).
- **Replace + thin smoke** — unit-test the logic, keep a small integration/container test that the
  seam is reached (when the bug was a wiring/call-site issue, e.g. 63405 asserted `onBack` presence
  rather than clicking a 3-level nav stack).
- **Keep e2e** — irreducible class above.

## Procedure

1. Read the e2e's assertions and the product path they exercise (`git log -S`, the fix commit).
2. Map the observable to a row in the seam table → find the seam (or classify as irreducible/BE).
3. Draft the unit test at that seam, following the file's conventions (see `typescript-write`).
4. Verify with a seam mutation (pass-clean / fail-mutant); optionally mutation-test the e2e to
   flag vacuity.
5. Emit a verdict: **replace** (+ draft), **replace + thin smoke**, **BE test**, or **keep e2e**
   (+ which irreducible class).

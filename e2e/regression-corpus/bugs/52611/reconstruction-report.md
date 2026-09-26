Worktree is clean (diff: none). I have everything needed. Here is my report.

---

## FE semantic-reconstruction report — issue 52611 (fix `18e423c8`)

### 1. git diff
**none** — negative outcome. Two scratch artifacts were created to characterize the target and then fully reverted; the worktree is clean (`git status` empty, `git diff --stat` empty).

### 2. Oracle
- **Shipped fix** (`18e423c8`, PR #52628): added one line to `frontend/src/metabase-lib/v1/expressions/resolver.js` in the JS `isCompatible(expectedType, inferredType)` type-checker — `expectedType === "expression" && inferredType === "aggregation" → true` — plus a jest test in `frontend/test/metabase/lib/expressions/resolver.unit.spec.js` (`"should allow sum inside expression in aggregation"`) and a Cypress test in `e2e/test/scenarios/question/notebook.cy.spec.js`.
- **Spec descendant located**: the shipped jest test survives (relocated + reworded) as `frontend/src/metabase/querying/expressions/pratt/compiler.unit.spec.ts:1068` — `it("should allow sum inside expression in aggregation", () => expect(() => expression("case(Sum([A] > 10), [B])")).not.toThrow())`.
- **Baseline**: `bun run test-unit-keep-cljs .../pratt/compiler.unit.spec.ts -t "sum inside expression in aggregation"` → **PASS** (1 passed, 59 skipped). A scratch diagnostics probe (`diagnose(..., "aggregation")` on the exact original formula `case(Sum([Total]) > 10, Sum([Total]), Sum([Subtotal]))`) also returned **undefined** (no error) at HEAD.
- **Reconstructed**: not achievable — see below.

### 3. failure_shape
No clean failure could be produced by any FE-side (JS/TS) mutation. The bug's product logic no longer lives in the FE.

### 4. Confidence + adversarial
Refactor `10fff67c186` ("Split up expression resolver", PR #56350) **deleted the entire JS `resolve`/`isCompatible` type-checker** from the FE. The new `resolver.ts` is a pure *name* resolver (type→dimension); the pratt compiler (`pratt/compiler.ts`) only assigns expected types via `defn.argType(...)` and builds the clause — it performs **no** expression-vs-aggregation compatibility check. All expression type-checking was moved into CLJS malli schemas (`src/metabase/lib/schema/expression.cljc` `type-of?`/`assignable?`), surfaced through `Lib.diagnoseExpression` (`src/metabase/lib/expression.cljc:689`), which the FE reaches only via `diagnostics/expression/check-lib-diagnostics.ts`.

Two consequences, both verified empirically:
- **The surviving jest test is non-discriminating.** `compiler.unit.spec.ts` drives `case(Sum([A] > 10), [B])` through a **stub resolver** that never throws, and the compiler no longer type-checks, so the test passes trivially regardless of the bug. It is a carried-over name, not a real guard for this behavior.
- **The real guard (CLJS `diagnose-expression`) is unreachable for mutation under the harness.** I proved this: forcing `diagnose-expression` to always return an error (edited the worktree `expression.cljc`) and re-running the scratch diagnostics spec under `test-unit-keep-cljs` → **still PASS**. `keep-cljs` uses the prebuilt CLJS from the symlinked `target/`, so no worktree CLJS edit is observable by the jest oracle. There is no FE JS/TS surface enforcing this check to revert instead (`argType` is defined in `clause.ts` but never consumed by any type-compatibility diagnostic).

Over-revert confirmation: fully neutralizing the changed logic (the CLJS check) tripped **zero** jest specs under the harness, and no TS location exists that reintroduces "aggregation rejected where expression expected."

### 5. Outcome
**reconstruction_failed — category: dead_target.**

The FE product code that carried the bug (`resolver.js` `isCompatible`) was deleted by refactor #56350 and relocated into the CLJS malli type system; the discriminating jest spec was effectively deleted (its survivor is non-discriminating). From the FE jest-recon harness there is **nothing FE-side to semantically revert**, and the CLJS layer where the logic now lives is not recompiled by `test-unit-keep-cljs`. (Secondary note: the fix's live regression protection is the surviving Cypress e2e test `notebook.cy.spec.js:1085` plus the CLJS-side diagnostics — a cypress_only flavor at the FE level.)

**Closable with a new unit test:** Yes, but not within this harness. A `diagnostics.unit.spec.ts` case in aggregation mode — e.g. `expect(err("case(Sum([Total]) > 10, Sum([Total]), Sum([Subtotal]))", "aggregation")).toBeUndefined()` — would be a discriminating jest guard against a regression in the CLJS `diagnose-expression` type-check under normal (cljs-recompiled) CI. It cannot flip under `keep-cljs` because that path pins prebuilt CLJS.
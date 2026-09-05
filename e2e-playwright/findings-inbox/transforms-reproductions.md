# transforms-reproductions — port note (SLOT 1, port 4101)

Source: `e2e/test/scenarios/data-studio/transforms/reproductions.cy.spec.ts` (277 lines)
Target: `e2e-playwright/tests/transforms-reproductions.spec.ts`
Support: `e2e-playwright/support/transforms-reproductions.ts` — **this is the expected name**, no deviation.
Queue gate: `token`. Jar verified by identity: `version.properties hash=751c2a9` vs COMMIT-ID `751c2a98`; `ps` shows the slot JVM running `target/uberjar/metabase.jar`.

6 upstream `it`s across 6 `issue NNNNN` describes → 6 Playwright tests, 1:1, in upstream order,
nothing dropped, merged, or weakened. No upstream `@skip`s in this file.

## Collision check

```
grep -rl "transforms/reproductions\|transforms-reproductions" tests/ support/   -> no matches (exit 1)
```

No existing port of this source. The sibling `transforms-*` modules
(`transforms.ts`, `transforms-inspect.ts`, `transforms-incremental.ts`,
`transforms-template-tags.ts`, `transforms-codegen.ts`, `transforms-permissions.ts`)
were read and **imported read-only**, never edited. Nothing shared was modified;
`PORTED.txt`, `QUEUE.md`, `playwright.config.ts` untouched; port 4000 never contacted;
nothing committed.

## Gate mapping, with the gate-OFF controls

Two independent gates. Both were controlled; the controls are the only trustworthy signal.

### 1. QA-database gate (`PW_QA_DB_ENABLED`)

All six describes restore `postgres-writable` and drive WRITABLE_DB_ID, so the gate is
file-wide. Placed at **describe level** (`test.skip(cond, reason)` in the describe body),
not in the `beforeEach` — issue 69904 has an `afterEach`, and the beforeEach form makes
skipped tests report as *failed*. All six use the same safe form for consistency.

| control | result |
|---|---|
| gate ON | **6 passed** |
| gate OFF | **6 skipped, 0 executed** — module still loads (the `pg` require is lazy inside `queryWritableDB`) |

Upstream carries **no `@external` tag** on this file even though it drives the writable
container exactly as its tagged siblings do. The tag is missing, not absent-by-design.

### 2. Token gate — RED HERRING, proven by control

I read the predicate in the source rather than inferring it from the tag:

- `src/metabase/transforms/util.clj:41-42` — `check-feature-enabled!` routes
  **query (native/MBQL) → `query-transforms-enabled?`**, **python → `python-transforms-enabled?`**.
- `token_check.clj:715` — `query-transforms-enabled?` = `(and transforms-enabled (or (not is-hosted?) (has-feature? :transforms-basic)))`.
  `is-hosted?` is **false** on the slot backend (measured), so the `or` short-circuits and
  the missing `:transforms-basic` never matters.
- `token_check.clj:724` — `python-transforms-enabled?` has no short-circuit — **but this
  file contains no python transform at all**, so that arm is never exercised. The 402 the
  brief describes is real but inapplicable here.
- `transforms/settings.clj:61` — the `transforms-enabled` getter falls back to
  `(and is-hosted? (has-feature? :transforms-basic))` only when **unset**; every `beforeEach`
  sets it explicitly to `true`, so the fallback is dead too.

**Which arms I ran: query/native and MBQL only — both arms of this *file*. The python arm
does not exist in this spec, so it was not run and is not claimed.**

Control, with the token actually **cleared** first (a leftover token is exactly what makes
a gated spec look ungated):

| step | measurement |
|---|---|
| with `pro-self-hosted` active | features **52**, `transforms-basic: false` → 6 passed |
| after `PUT premium-embedding-token = null` | features **0**, `transforms-basic: false`, `is-hosted?: false` |
| `activateToken` removed from all 6 beforeEaches, run at **0 features** | **6 passed** |

Conclusion: the `token` tag is a red herring for this file. `activateToken` is nevertheless
**kept** in the beforeEach — it is what upstream does, and removing it would be an
unrequested change to shared backend state on a slot other specs reuse.

**TOKEN RESTORED — confirmed.** Final state re-measured after the control:
`features count: 42`, `transforms-basic: false` (= `pro-self-hosted`, matching the
independent measurement in the transforms-inspect port). No token values printed anywhere.

**UNEXPLAINED (recorded, not rationalised):** the *pre*-control reading was **52** features,
where 42 is the pro-self-hosted count both before and after. My slot is exclusive (4101) and
the last write before that reading should have been my own `pro-self-hosted`. I cannot
account for the 52 and I am not inventing a mechanism. It does not affect any conclusion
here: the decisive control ran at **0** features, which is unambiguous, and the restored
state is 42.

## Environment-forced divergences (2), both measured

### A. `H.popover().findByText("Writable Postgres12").click()` cannot be ported literally

Spec lines 23 and 226. Literal port spent the full 30s in
`element was detached from the DOM, retrying`. Probed rather than inherited from the sibling
that reports the same symptom:

```
PROBE databases: [{"id":1,"name":"Sample Database","engine":"h2"},
                  {"id":2,"name":"Writable Postgres12","engine":"postgres"}]
PROBE t~0:    popovers=1 dbRows=1 topBar="Select a database"
PROBE t~200:  popovers=0 dbRows=0 topBar="Writable Postgres12"
PROBE t~500+: popovers=0 dbRows=0 topBar="Writable Postgres12"
```

Exactly one database is transform-eligible (H2 is not), so the app **auto-selects** it and
the popover is gone by t+200ms with no click from the test. Note this is the **auto-select**
mechanism, **not** the "two popovers transiently visible" one the sibling's comment
describes first — the probe shows exactly one popover, never two.

Ported as the STATE the click establishes (`native-query-top-bar` bound to DB_NAME), which
is all the rest of each test depends on. Not a weakening: if a second eligible database ever
appears, this fails loudly instead of proceeding on the wrong database.

### B. `H.leaveConfirmationModal().should("be.visible")` — Cypress/Playwright semantics differ

My first reading of this failure was **wrong** and is corrected here. The URL *does* change
to `/data-studio/transforms` on back-navigation, and I initially read that as "the route
blocker never fired". It is the app's design:
`use-confirm-route-leave-modal.ts` shows the modal and, on confirm, dispatches `goBack()`
for a POP. The modal was open the whole time. Measured DOM:

```
className:    "... mb-mantine-Modal-root"      <- the element data-testid sits on
rect:         { w: 1280, h: 0 }                <- ZERO HEIGHT
display: block   visibility: visible   opacity: 1
textSnippet:  "Discard your changes?Your changes haven't been saved, ..."
contentClass: "... mb-mantine-Modal-content ..."
contentRect:  { w: 620, h: 190 }               <- what the user actually sees
```

`data-testid="leave-confirmation"` sits on Mantine's Modal **root**, a positioning wrapper
whose own border box is zero-height because the dialog inside is `position: fixed`.
Playwright's `toBeVisible()` requires a non-empty box **on the element itself**; Cypress's
`should("be.visible")` does not. Harness-semantics difference, **not port drift and not an
app failure**. Visibility is asserted on the `[role=dialog][aria-modal]` content node (the
same selector the shared `modal()` helper uses); the `should("not.exist")` assertions stay
on the root, where existence is the subject and the zero box is irrelevant.

Also: `cy.go("back")` is `window.history.back()` on the app window, which is what
react-router v3's `setRouteLeaveHook` observes. Ported as
`page.evaluate(() => window.history.back())`, not `page.goBack()` (a CDP history navigation).

## Warehouse: two target-table renames, both forced by a MEASURED collision

The writable container is never reset here (Cypress's `H.restore("*-writable")` also calls
`resetWritableDb`; ours does not, and it is not ported anywhere). `POST /api/transform` 403s
when the **physical** target table exists (`transform.clj:183` → `target-table-exists?`) —
on **create**, not only on run. Inventory taken *before* writing a line of the port:

```
 table_schema |   table_name
--------------+-----------------
 Schema A     | transform_table
```

`"Schema A"."transform_table"` — upstream's GDGT-1774 target **verbatim** — was already
occupied by a live sibling (`transforms.spec.ts`, whose sweep owns every `%transform%` table
in Schema A/B/Domestic/Wild/public). Deleting it was rejected: siblings may be mid-run.

| upstream literal | ported as | why |
|---|---|---|
| GDGT-1774 `"Schema A"."transform_table"` | `"Schema A"."repro_1774_target"` | literal already occupied by a live sibling → guaranteed 403 |
| #69904 `public."deleted_transform_table"` | `public."repro_69904_target"` | matches the sibling's `%transform%` sweep over `public` → sibling could drop it mid-run |

**Neither name is the subject of any assertion** (GDGT-1774 asserts the field picker offers
options; #69904 asserts "Transform does not exist anymore"), so no assertion changed. Same
precedent and rationale as `support/transforms-incremental.ts`.

The other four names are **verbatim**, each checked individually: #68378, GDGT-2429 and
UXW-3160 all create a transform *without running it*, so no physical table is ever written
and the guard cannot trip; GDGT-1776 creates nothing.

`resetReproTargetTables()` matches those two **exact names** across all schemas and never
drops a schema — it cannot disturb a sibling. `resetEmptySchema()` only ever `CREATE SCHEMA
IF NOT EXISTS`; no foreign schema is dropped anywhere in this port.

## Assertion-shape decisions

- **`directText()`** reproduces testing-library's `getNodeText` (DIRECT CHILD text nodes only)
  where Playwright's `getByText` reads full `textContent`. Used for the CodeMirror line
  marker (UXW-3160) and the Mantine `SelectItem` option (#68378), **and on the `not.exist`
  check** for "Something's gone wrong" (GDGT-1776) — a broader matcher on an absence
  assertion drifts the wrong way.
- `should("not.exist")` → `toHaveCount(0)`; `should("have.length.greaterThan", 0)` →
  `not.toHaveCount(0)` (retries; `expect(await loc.count()).toBeGreaterThan(0)` would not).
- **Virtualization warning INAPPLICABLE — mechanism checked**, not merely unobserved:
  `SchemaFormSelect` is a Mantine `FormSelect` fed a plain `data: string[]`. Mantine `Select`
  is not virtualized, so all ~35 schemas render and `empty_schema` is reachable. (Mantine's
  `shouldFilter: searchValue !== selectedOption.label` special case is also why the seeded
  `searchValue` does not filter the list on open.)
- `H.NativeEditor.type(..., { allowFastSet: true })` does not type — it writes `.cm-content`
  textContent then " {backspace}". Ported via the existing `fastSetNativeEditor`. No
  keystrokes ⇒ the CodeMirror `{Enter}`/`interactionDelay` hazards are inapplicable here.
- Toast strict-mode hazard: **inapplicable** — this spec asserts no toasts.
- `cy.intercept(url, {statusCode:500})` empty-body trap: **inapplicable** — the only intercept
  (GDGT-1776) supplies an explicit 200 body.
- `cy.wait("@alias")` queue semantics: the only awaited alias is `@createTransform` in
  GDGT-2429, and **no `/api/transform` POST fires earlier in that test**, so registering the
  wait immediately before the triggering click is equivalent. Checked, not assumed.

## Two upstream weaknesses — ported verbatim, RECORDED, not strengthened

1. **#68378 ends on `H.modal().button("Save").click()` with no assertion after it.** A failing
   Save would go unnoticed in either harness. The real reproduction assertion is the one
   before it (`empty_schema` offered in the picker), and mutation M1 proves that one is live.
2. **GDGT-1776 asserts `loading-indicator` does not exist *before* asserting Cancel is
   visible.** That ordering makes the first assertion satisfiable pre-fetch. The test is not
   vacuous overall — the positive `Cancel` visibility check that follows is the real anchor —
   but the order is upstream's and is preserved.

One deliberate **strengthening**, stated as such: `expect(scroller).toHaveCount(1)` in
UXW-3160. `cy.get` is any-of while a Playwright Locator is strict; the one-scroller
precondition is asserted rather than hidden behind a `.first()`.

## Order-dependence

`--repeat-each=3`, whole file, single worker: **18/18 passed** (27.3s). No order dependence,
no warehouse-residue accumulation across repeats.

## Are any tests inert? No — checked

`git log` on the source shows all six repros are recent and none of the asserted behaviour
has been deleted. Every asserted string was grepped in the current tree and found:
"Transform does not exist anymore" (`TableAttributesEditSingle.tsx`), "Field to check for new
values" (`IncrementalTransformSettings.tsx`), "Save your transform" (`CreateTransformModal.tsx`),
"Create a transform" (`CreateTransformMenu.tsx`), `leave-confirmation` (`LeaveConfirmModal.tsx`),
`transform-query-editor` (`NewTransformPage.tsx`). The most recent commit on the source
(`530bae6edc8`) is a *flakiness* fix to GDGT-2429, whose 8-line focus-trap wait is ported
along with its comment because the wait is load-bearing.

## Mutation testing

**Verifier sanity-checked BEFORE use** (anchored replace, `count == 1` required, file read
back, md5 compared):

| sanity case | result |
|---|---|
| anchor occurs **0** times | ABORT exit=2, file md5 unchanged ✅ |
| anchor occurs **6** times (`await mb.restore("postgres-writable");`) | ABORT exit=2, file md5 unchanged ✅ |
| anchor occurs **exactly 1** time | APPLIED, mutant read back present, restore byte-identical ✅ |

The multi-site case is not hypothetical — it caught a 6-occurrence anchor that would have
mutated six sites and mis-attributed the death.

| # | test | mutation | kind | result | died where |
|---|---|---|---|---|---|
| M1 | #68378 | `CREATE SCHEMA empty_schema` → `DROP SCHEMA empty_schema` | **input** | ☠️ killed | :223 `empty_schema` visible |
| M2 | GDGT-1776 | error-absence `toHaveCount(0)` → `(1)` | assertion | ☠️ killed | :287 error absence |
| M2b | GDGT-1776 | 1000-item mock route never matches | **input** | 🟢 **survived** | — |
| M3 | GDGT-1774 | remove `fieldPicker.click()` | **input** | ☠️ killed | :356 options present |
| M4 | UXW-3160 | remove the `scrollTop = scrollHeight` scroll | **input** | ☠️ killed | :413 last line visible |
| M5 | #69904 | remove the `DELETE /api/transform/:id` | **input** | ☠️ killed | :466 "Transform does not exist anymore" |
| M6 | GDGT-2429 | remove `keyboard.press("Escape")` | **input** | ☠️ killed | :529 leave-confirm dismissed |

6 killed, each at a **distinct** assertion site — every test has at least one live assertion,
and no two mutants died at the same place, so there is no tail to aim a follow-up at.

**Calling out my own bad mutation:** M2 is an *assertion* inversion, not an input inversion —
weaker than the other five. It proves the "Something's gone wrong" check is non-vacuous (the
locator evaluates and does fail when inverted) but says nothing about whether the 1000-item
mock is load-bearing. M2b was added to answer that properly.

**The M2b survivor is a question, and the answer is "the data cannot discriminate", not
"the assertion is vacuous."** GDGT-1776 asserts the *absence* of a crash that has been fixed;
on a fixed build both the 1000-item payload and the real (small) payload produce a healthy
page, so no input can kill it. M2 already established non-vacuity via the presence/absence
probe. The mock is load-bearing only as a *regression* guard — it is what would surface a
GDGT-1776 regression. Upstream has exactly this property; it is not a port defect.

**Both files restored byte-identical, confirmed by md5 and `diff -q`:**
`tests/transforms-reproductions.spec.ts` md5 `097e1a920a8091fad392c1d013280064`,
`support/transforms-reproductions.ts` md5 `30f3fb3fb60cba179db5338f07d06ae2`.
Full run re-verified green after restore.

## tsc

`bunx tsc --noEmit` — **clean for both my files**. Imports **hand-audited** rather than
trusted to tsc (which is provably silent on dead imports): all 26 imported bindings in the
spec and both in the support module are used.

One pre-existing error in `tests/alert.spec.ts` (`TS2339: Property 'id' does not exist…`) is
a **concurrent sibling's** file — it did not exist at my first clean tsc run earlier in this
session. Not mine, not touched.

## Shared state — before / after

| | before | after |
|---|---|---|
| `"Schema A"."transform_table"` (sibling's) | present | **present, untouched** |
| `repro_1774_target` / `repro_69904_target` (mine) | absent | **absent** (swept by beforeEach + afterEach) |
| `uxw_3160_target`, `sql_transform` | absent | absent (never created — those transforms are never run) |
| schemas | 33 | 39 |
| `empty_schema` | absent | **present** (added by this spec's fixture, as upstream's does; deliberately not dropped) |
| `metabase_cache_*` | 4 | 8 (created by other slots, **not by me**) |
| token features | 52 *(unexplained, see above)* | **42 = pro-self-hosted, restored** |

No foreign schema dropped. No shared support module edited. `PORTED.txt`, `QUEUE.md`,
`playwright.config.ts` untouched. Both scratch probe specs
(`tests/s1-transforms-repro-probe.spec.ts`, `tests/s1-transforms-repro-tokenoff.spec.ts`)
were deleted; `git status` shows only my two intended new files.

## Fixmes

**None.** All 6 tests execute and pass; nothing is `test.fixme`'d or skipped beyond the
QA-DB gate.

## Caveat

**No Cypress cross-check was run** (standing rule — it would disturb live sibling slots), so
I cannot say whether upstream also races the database-popover auto-select, or whether CI has
a second eligible database that keeps that popover open. Divergence A is recorded as
environment-dependent rather than claimed as a product or upstream defect.

## Summary

Six independent reproductions ported 1:1 and all six pass, green under `--repeat-each=3`
(18/18) with no order dependence; 6 of 7 mutants killed at distinct sites, the lone survivor
explained as an undiscriminating-input property of a fixed-crash regression test rather than
a vacuous assertion.

The `token` gate is a **red herring**, proven by control at **0 token features** rather than
inferred: this file has no python transform, and the query-transform predicate short-circuits
on `is-hosted? = false`; the token was cleared for the control and **restored to
pro-self-hosted (42 features), verified**.

Two divergences are environment-forced and measured, not drift — the single-eligible-database
popover auto-select (gone by t+200ms), and Cypress-vs-Playwright `be.visible` semantics on a
zero-height Mantine Modal root — and two upstream target-table literals were renamed because
one was **measurably already occupied** by a live sibling in the never-reset writable container.

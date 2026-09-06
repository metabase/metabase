# native-reproductions (slot 4 / :4104)

Source: `e2e/test/scenarios/native/native-reproductions.cy.spec.**ts**` (1015 lines)
Target: `e2e-playwright/tests/native-reproductions.spec.ts`
Helpers: `e2e-playwright/support/native-reproductions.ts` (new, per-spec)

## Collision checks (both done before writing)

1. **Same-basename siblings in the source dir — CONFIRMED PRESENT.**
   `e2e/test/scenarios/native/` holds BOTH `native-reproductions.cy.spec.ts`
   (26.9K) and `native-reproductions.cy.spec.js` (29.3K). They are disjoint
   specs. This port covers **only the `.ts`**; the `.js` sibling is still
   unported. The spec header records this so a later agent can't overwrite it.
2. **Existing target in `tests/` — none.** `ls tests/ | grep native` returns
   `native-filters-remapping`, `native-query-drill`, `native-snippet-tags`,
   `native-sql-generation`, `native-subquery`, `native-suggestions`,
   `native-table-tags`, plus `snippets` / `data-studio-snippets` /
   `embedding-snippets` / `sql-filters*`. No `native-reproductions.spec.ts`.
   Nothing was overwritten.

## Actual infra tier (the classifier was wrong again, in both directions)

This file is **mixed tier**, and the upstream tags do not describe it:

| Tests | Tier | Evidence |
|---|---|---|
| 24 | **Bare jar / H2 sample DB only** | run green with `PW_QA_DB_ENABLED` unset |
| 4 | **QA Postgres container** (`postgres-12` ×3, `postgres-writable` ×1) | 11727, 55951, 57644-multi, 59356 |
| 1 | **QA Mongo container** (`mongo-5`) | 53299 |

Two corrections to the "tag ⇒ tier" assumption:

- **`@external` under-reports.** Only `issue 11727` carries `@external`. But
  `issue 55951` and `issue 57644 > with multiple databases` carry **no tag at
  all** and both `H.restore("postgres-12")` and assert on `"QA Postgres12"`.
  `issue 59356` carries no tag and restores `postgres-writable`. Three of the
  five container-dependent tests are untagged.
- Nothing here needs maildev/`@mongo`-adjacent mail infra, so the brief's
  "`@external` also covers maildev" caveat doesn't apply — but the underlying
  point (the tag is not the tier) bit this file harder than usual.

All 5 container tests gate on the deliberate `PW_QA_DB_ENABLED`, not the bare
`QA_DB_ENABLED` (which leaks truthy from `cypress.env.json`).

## Executed vs gate-skipped, with the control (#67/#49)

| Run | Command | Result |
|---|---|---|
| Gate ON | `PW_QA_DB_ENABLED=1` | **29 passed** |
| Gate ON, ×2 | `--repeat-each=2` | **58 passed** |
| **Gate OFF (control)** | env var removed | **24 passed, 5 skipped, 0 failed** |

The gate-off control skips exactly the 5 container tests and nothing else. No
`afterEach` exists in this spec, so the "48 failed instead of 48 skipped"
teardown trap does not apply. Jar confirmed at the start of every run: PID on
:4104 is `java -jar target/uberjar/metabase.jar`, `version.hash = 751c2a9` vs
`target/uberjar/COMMIT-ID = 751c2a98`.

`tsc --noEmit`: clean for both new files.

**No fixmes.** 29/29 ported and executable.

## Container evidence (#85)

Only `issue 59356` touches the writable container. Inspected via `pg` directly
(read-only; **no foreign schemas dropped**):

```
29 schemas / 33 tables: Domestic, Schema A … Schema Z, Wild, public
Domestic.Animals, Schema A.Animals … Schema Z.Animals,
Wild.Animals, Wild.Birds,
public.composite_pk_table, public.many_data_types, public.no_pk_table, public.products
```

The #85 debris is present and I left it alone. **It is structurally irrelevant
to this spec**: 59356 runs `select pg_sleep(5000)` and asserts only on the
loading indicator, the empty-state message, and a `POST /api/dataset` request
count. It never opens a schema/table picker, never lists tables, and makes no
absence assertion that a foreign fixture could satisfy vacuously. So no schema
pinning was needed — and the mutation below proves the test is load-bearing
against this exact contaminated container rather than passing around it.

## Mutation testing

Twelve mutants, aimed to spread across tests and at tails. **Where each died:**

| # | Mutation (input, not expectation) | Result | Died at |
|---|---|---|---|
| M1a | *probe*: hover a control that DOES have a tooltip, same 1s settle | count **1** | — locator can match ⇒ #51035 check is real |
| M1b | metric renamed `Test Metric 49454` → `Renamed Thing` | killed | `-metric-49454` completion (**tail** of 49454) |
| M2 | typed `"pro"` → `"zzq"` | killed | 48712 assertion #1 |
| M3 | REVIEWS fields left **un**-sensitive | **SURVIVED** → see below | — |
| M3′ | same, after the anchor fix | killed | the `ID` absence check |
| M4 | widget value ≠ default (`?state=NY`) | killed | revert-icon absence (38083's only assertion) |
| M5 | `graph.metrics` → `["Total"]` | **SURVIVED** (bad mutation) | — |
| M5b | `graph.metrics` → `["World"]` (the renamed-away column) | killed | `toHaveCount(2)` → got **4** (**tail** of 66745) |
| M6 | `pg_sleep(5000)` → `select 1` | **SURVIVED** (bad mutation) | — |
| M6b | the two CANCEL presses sent as an unbound combo | killed | `getLoader() toHaveCount(0)` (**mid-test** cancel assertion) |
| M7 | typed `"s"` → `"savepoin"` | killed | scroll assertion (63711 #1) |
| M8 | drag mousemoves removed | killed | placeholder `"A"` ≠ `"B"` (69160's only assertion) |
| M9 | *natural*, run 1: the multi-range selection mis-fired | killed | executed `select foobar'`; died at `'foobar'` |
| M10 | `restore("postgres-12")` in the one-database describe | killed | the momentary `count()` check (57644) |

### 🔴 M3: a genuinely vacuous absence assertion — vacuous UPSTREAM too

`issue 53194` clicks REVIEWS in the data-reference sidebar and asserts
`cy.findByText("ID").should("not.exist")` (all REVIEWS fields having been made
`sensitive` in the `beforeEach`).

My first port anchored on the only signal the DOM offers at that instant — the
sidebar header title flipping to `"REVIEWS"`. **M3 survived**: with the fields
left un-sensitive, `toHaveCount(0)` still passed.

Answered the "vacuous, or bad mutation?" question by asserting **presence**
under the same mutation (the technique from `embedding-hub`): flipped it to
`toHaveCount(1)` and the ID field **was found**. So the check was sampling too
early, not asserting nothing.

Measured the render sequence directly:

```
REQ GET /api/table/8            <- REVIEWS
REQ GET /api/table/8/query_metadata
REQ GET /api/table/8/fks
SETTLED REVIEWS: "REVIEWS\nReviews that Sample Company customers have left on our products."
SETTLED ORDERS:  "ORDERS\n…\n9 columns\nID\nUSER_ID\n…\n0 connections"
```

The title paints immediately; the **column list only after
`/api/table/:id/query_metadata` resolves**. Cypress's `should("not.exist")` has
the identical first-absent-observation semantics and has no better anchor
either — **so this is vacuous upstream, not port drift.**

Fixed by anchoring on the metadata response *plus* the table description (which
renders in **both** variants, so it proves the page body — columns section
included — has rendered). **M3′ then kills at the absence check.**

This is the 8th upstream vacuous assertion the technique has found.

### Why M5 and M6 survived (bad mutations, not vacuity)

- **M5** shrank nothing observable: the viz-settings sidebar renders
  dimension + Total = 2 field inputs whether `graph.metrics` is
  `["Total","World"]`-after-rename or `["Total"]`. Re-aimed as **M5b**, which
  is decisive and informative: with the *only* configured metric renamed away,
  the settings fall back to listing **all four** columns
  (`["CATEGORY_NAME","Total","Hello","World2"]`). So the tail assertion really
  does verify "settings survived the rename" rather than "some inputs exist".
- **M6** exposed an *inherited* weakness rather than a port one. The
  `cy.get("@dataset.all").should("have.length", n)` assertions are **retrying
  equalities**, so they pass the instant the count matches and cannot enforce
  "and no further query fired". Ported verbatim (as a passive request counter +
  `expect.poll`) because that is exactly upstream's semantics; documented
  inline. **M6b** shows the surrounding loader/empty-state assertions *do*
  carry the cancel behaviour.

## New gotchas for PORTING.md

1. **🔴 A native parameter widget DROPS its `placeholder` attribute once
   focused — so re-resolving the input by placeholder after clicking it finds
   nothing.** `cy.findByPlaceholderText("Foo").type("foobar")` resolves the
   locator **once**, clicks, and then sends keys to `document.activeElement`. A
   port that does `input.click()` then `expect(input).toBeFocused()` (or
   `input.pressSequentially(...)`) re-runs the query against a DOM where the
   attribute is gone. Fingerprint is misleading: the **click succeeds** and the
   failure lands on the *next* line ("element(s) not found" for a locator that
   demonstrably just worked). Cost 2 of 4 run-1 failures (16584, 56905).
   Fix: resolve → `expect(...).toBeVisible()` → `click()` → `page.keyboard.type()`.

2. **🔴 The FIRST `Mod-j` after a CodeMirror completion tooltip appears is
   silently dropped.** `{nextcompletion}` in `e2e-codemirror-helpers.ts` is
   `cy.wait(50)` + `cy.realPress([metaKey,"j"])`. Ported literally the selection
   does not move. Measured, decisively:
   - the keydown **is** delivered (`key:"j"`, `code:"KeyJ"`, `metaKey:true`) and
     comes back with **`defaultPrevented:false`** — i.e. CodeMirror's
     `moveCompletionSelection` *declined* it, the completion source still
     recomputing;
   - a second press ~400ms later moves the selection 0 → 1 exactly as intended;
   - `ArrowDown` then moves it 1 → 2, so the tooltip was active throughout.

   Cypress's per-command queue latency always covered that window. Fix is
   PORTING's sanctioned re-nudge (`pressArrowUntilActive` shape): press **only
   while** the target option is unselected, so a dropped press is retried and a
   landed one cannot overshoot. Related to but distinct from the known
   "selection resets to index 0 mid-sequence" note — here the press is refused
   outright, not applied-then-reset.
   Also confirms `aria-selected` is a genuine discriminator on CM6 completion
   rows (only the active option carries it), so upstream's one-arg
   `have.attr` → `toHaveAttribute(name)` is a real check.

3. **Cypress's `.click(position)` coordinates are ROUNDED, and the rounding is
   load-bearing on text.** From the Cypress dist bundle
   (`getCoordsByPosition`): `left → Math.ceil(left)`,
   `center → Math.floor(left + width/2)`, `right → Math.floor(left+width) - 1`,
   y for all of those `→ Math.floor(top + height/2)`. Those are **absolute**
   viewport coords; Playwright's `position` is relative to the padding box.
   Porting `"left"` as a naive `{x: 0}` puts the click exactly on the boundary
   between the preceding token and this one, and CodeMirror's word-select then
   grabs the whitespace instead of the leading quote. Fingerprint was excellent:
   the app's own error banner showed the executed SQL as `select foobar'`,
   one quote short of the expected `select 'foobar'` (54799).

4. **`H.NativeEditor.type(text, { allowFastSet: true })` is not typing at all.**
   It does `helpers.get().invoke("text", text)` — a jQuery `.text()` write onto
   `.cm-content` — then types `" {backspace}"` to wake CodeMirror's validator.
   Ported as `fastSetNativeEditor`. Worth knowing because the strings it is used
   for (`{{#12-reference-question }}`, `{{ snippet: A and B }}`) are exactly the
   ones close-brackets/autocomplete would mangle if typed — this is the
   *upstream* workaround for the brief's "drive bracket-bearing args with
   `insertText`" rule, and the faithful port is to reproduce the DOM write.

5. **`findByText("AVEPOINT")` resolves to `.cm-completionLabel` ITSELF.**
   testing-library's `getNodeText` joins only **direct text-node children**, and
   CM6 wraps the matched prefix `"S"` in `.cm-completionMatchedText` — so the
   label element's direct text is `"AVEPOINT"`. Playwright's `getByText`
   compares full element text and matches **nothing**. Another instance of the
   mixed-content-text-nodes rule, and the reason 63711's inner/outer height
   comparison has to select `.cm-completionLabel` explicitly.

6. **`createNativeCard` (native-extras) hardcodes `visualization_settings: {}`.**
   One test here (66745) needs them in the POST; `factories.createQuestion`
   accepts `native` + `visualization_settings` and is the right helper. Worth a
   line in `support/INDEX.md` — the two native-card factories are not
   interchangeable and the difference is silent.

## ⚠️ Measured, order-sensitive race — reported, NOT inflated into a bug claim

`issue 57644 > with only one database` asserts `"Select a database"` is visible.
**With exactly one database the app auto-selects it shortly after the editor
mounts**, so that string is a *transient* state and the assertion is a race.

Measured on the jar:

- **10/10** passes when the test runs in isolation;
- **1 failure in 6** whole-file runs;
- deliberately inflatable to **3/12** by inserting ~100ms of work (two API
  probes) before the assertion. In 2 of those 3 failures the probe *itself* read
  `"Select a database"`, and it had flipped to `"Sample Database"` by the time
  the assertion ran — which pins the mechanism.

**Ruled out** (probed, not assumed): a leaked `last-used-native-database-id`
user setting (`undefined` in every run, including failures) and a stale second
database from the sibling `postgres-12` describe (db count `1` in every run).

Upstream has the identical construction and is equally exposed, so this is not
port drift. I have **not** hardened it — any tolerance for the auto-selected
state would delete the check — and I have **not** claimed the auto-select is a
regression, because I cannot tell from here whether it is intended behaviour
that the upstream test is racing. Flagging it as a CI flake candidate; the
second assertion (the actual #57644 subject) is not racy.

## Faithfulness notes worth keeping

- `issue 59356`'s "no new query fired" assertions cannot fail by construction
  (retrying equality passes on first match) — inherited from upstream, ported
  verbatim, documented inline.
- `issue 57644`'s `{ timeout: 0 }` is ported as a **non-retrying** `count()`.
  This is PORTING's one legitimate case: the upstream comment says the popover
  "disappears immediately and we don't want that to make the test pass", so a
  retrying form would be satisfied by the bug closing itself. M10 confirms it
  still kills.
- `issue 38083`, `issue 53171` and the `52812` half of `52811/52812` each had a
  Cypress chain whose `findAllByTestId`/`findByTestId` anchor carries an
  implicit existence requirement that a bare `toHaveCount(0)` drops; each is
  ported with the anchor as its own visibility assertion first.

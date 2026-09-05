# embedding-hub (slot 2 / :4102)

Port of `e2e/test/scenarios/embedding/embedding-hub/embedding-hub.cy.spec.ts`
(1923 lines, 36 tests) → `e2e-playwright/tests/embedding-hub.spec.ts`
plus `e2e-playwright/support/embedding-hub.ts`.

## Result

| run | outcome |
|---|---|
| gate ON (`PW_QA_DB_ENABLED=1`), jar `751c2a98` | **36 passed, 0 skipped** |
| gate ON, `--repeat-each=2` | **72 passed** (twice: before and after the anchor change) |
| gate OFF | **28 passed, 8 skipped** |
| `bunx tsc --noEmit` | clean |

**Executed vs gate-skipped:** 28 of the 36 tests restore the `setup` snapshot
and need no container — they run on the bare jar. 8 need the QA Postgres
containers and are gated:

- `create tenants step › shows autocomplete suggestions for organization_id …` (`postgres-12`)
- `shows RLS data permissions description in summary` (`postgres-12`)
- `should create sandboxes for multiple tables via row-level security setup` (`postgres-12`)
- `should update existing sandboxes when changing column selection` (`postgres-12`)
- `should block schemas without selected tables in RLS setup` (`postgres-writable`, upstream `@external`)
- `connection impersonation › should configure connection impersonation for selected databases` (`addPostgresDatabase`)
- `connection impersonation › should show disabled database with tooltip …` (`addPostgresDatabase`)
- `connection impersonation › reopens the create tenants step …` (`addPostgresDatabase`)

**The QA-DB path was genuinely exercised, not merely "not skipped".** Direct
evidence rather than inference:

- `should block schemas without selected tables` writes the `multi_schema`
  fixture over a live knex/pg connection to `writable_db` on :5404, resyncs
  db 2, drives the mini-picker through `Writable Postgres12 → Domestic →
  Animals`, and then asserts `view-data["Wild"] === "blocked"` in the
  permissions graph. None of that is reachable without the container.
- `should create sandboxes for multiple tables` resolves `orders`/`people`
  table ids on db 2 via `/api/table` and asserts the resulting GTAPs.
- The three impersonation tests POST a real connection to `localhost:5404`
  and wait for `initial_sync_status === "complete"`.

I did **not** stop the containers to prove the gate empirically — they are
shared with the other slots. The gate-off run's 8 skips match the 8 tests that
touch a container, by construction.

## Failures on first execution (1 of 36) — port drift, as the prior says

### Mixed-content toast text — a PORTING rule I applied in one test and missed in its sibling
`"Create a dashboard" card should save the x-ray and show a success toast` was
the only red on run 1. The toast body (`EmbeddingHubXrayPickerModal.tsx`) is a
single `<div>` holding the text node `Your dashboard was saved` **and** a
`<Link>See it</Link>`, so its full element text is
`"Your dashboard was savedSee it"`. testing-library's exact `findByText`
matches an element's *direct text nodes*; Playwright's exact `getByText`
compares *full element text*. Fixed with a case-sensitive substring regex.

Worth recording for the fingerprint, which points the wrong way: the
error-context snapshot showed the "Create a dashboard" step already marked
**Done** — the x-ray had generated and saved fine — so the failure read as
"the app never fired the toast" rather than "my matcher is wrong". A sibling
test in the same file that used `toContainText` on the same toast passed, which
is what identified it.

## Mutation results (4 probes, all conclusive)

| # | probe | outcome |
|---|---|---|
| A | `embedding checklist should not show up … if not enabled`: set `embedding-homepage: visible` | **killed** — at the `greeting-message` anchor, i.e. the anchor is genuinely discriminating |
| B | `'Select data' step unlocked when RLS is configured`: drop the `sandboxTable` seeding from the beforeEach | **killed** — `icon(…, "lock")).toHaveCount(0)` went red |
| C | mini-picker absence check re-pointed at `QA Postgres12` (a name that IS present) | **killed** — the absence locator can match, so "Sample Database is hidden" is not vacuous |
| D | fulfil `PUT /api/permissions/graph` with 500 so an error toast fires | **SURVIVED** — see below |

### D is a real finding: `undoToast().should("not.exist")` is vacuous by timing

Three tests (24, 25, 26) carry upstream's `H.undoToast().should("not.exist")`
straight after the sandbox-creating PUT resolves. Under the 500 mutation the
test sailed straight past that assertion and died four assertions later on the
GTAP count.

Confirmed the toast really is emitted, rather than assuming it: flipping the
same assertion to `toHaveCount(1)` under the same mutation **found the toast**.
So the error toast exists and the absence check simply observes the DOM before
it paints — the retrying `toHaveCount(0)` is satisfied at the first absent
observation, exactly as Cypress's `should("not.exist")` would be. **This is a
faithful port of an assertion that is a no-op upstream too**, not port drift.

Fix applied, per PORTING's "the fix is an ANCHOR, not a different assertion
form": gate each of the three absence checks on the success signal the same
submit produces — the `check` icon on the *Select data to make available* step.
Re-ran mutation D against the anchored version: **killed at the anchor**.
Nothing was dropped, weakened or merged; the original assertion is still there.

This is a shape worth sweeping for: `undoToast().should("not.exist")` /
`toHaveCount(0)` taken immediately after a helper that resolves on a network
response is vacuous **by construction** (batch-12 already flagged the one-shot
`count()` variant of this; the retrying variant has the same hole, for the
opposite reason).

## Other things learned / worth folding back

### `.closest("button")` on a hub card resolves to the STEP, not the card
`cy.findByText("Connect a database").closest("button")` reads like it scopes to
the card. It does not: hub cards are Mantine `Card`s (divs), and the nearest
`button` ancestor is the Mantine `Stepper.Step` — an `UnstyledButton` wrapping
the entire step's label *and* description. It is unambiguous here only because
`use-get-embedding-hub-steps.ts` gives every hub step exactly one card; a
second card in a step would silently widen every `Done` / `lock` assertion in
this spec. Documented on `closestButton` in `support/embedding-hub.ts`.

### `should("be.empty")` on an `<input>` is vacuous
`disables the Enable JWT button when IdP URI is empty` asserts
`cy.findByLabelText(/JWT Identity Provider URI/i).should("be.empty")`.
chai-jquery's `empty` asserts *"the target has no child nodes"*, which is
trivially true of a void element and says nothing about the value. Ported as
`toHaveValue("")` — what the test plainly means — and flagged in the spec
header rather than copied silently. Same family as the `have.attr` on a boolean
attribute gotcha: a chai-jquery special case that changes what the assertion is.

### `H.addPostgresDatabase` is not a thin POST
It blocks on `initial_sync_status === "complete"` and then on field analysis
(giving up optimistically after 20s / 10s). The shared
`documents-core.addPostgresDatabase` only does the POST. I wrapped it with the
sync wait in `support/embedding-hub.ts` rather than editing the shared module.
**Consolidation candidate**: the sync wait belongs next to the POST — any port
that adds a QA database and then reads its metadata will need it.

### `resetTestTable` has no `multi_schema`
`actions-on-dashboards.resetTestTable` only knows `scoreboard_actions` /
`many_data_types`. `multi_schema` is used by 15+ Cypress specs (data-model,
workspaces, entity-picker, interactive-embedding…), so the copy I wrote in
`support/embedding-hub.ts` should move somewhere shared at consolidation.

### Cypress-queue settle around `cy.request` after a click
Two `cy.request("GET", "/api/session/properties")` assertions taken immediately
after a UI click are wrapped in `expect.poll`. Cypress's command queue supplies
a settle between the click and the request that Playwright does not; the
assertion itself is unchanged.

### Absence anchors added (each Cypress chain carried one implicitly)
- `Done` absent in a step → anchored on the card title being visible.
- `Get started with modular embedding` absent on `/` → anchored on
  `getByTestId("greeting-message")`, which the **ordinary** homepage renders
  and `EmbeddingHubHomePage` (which replaces it wholesale) does not. A
  discriminating anchor, not a settle — and mutation A confirms it discriminates.
- `Our analytics` / `Sample Database` hidden in the RLS mini-picker → anchored
  on `QA Postgres12` being visible in the same picker.
- `Orders` hidden on the second table card → anchored on `People` being visible.
- `lock` absent on *Select data to make available* → anchored on the step
  listitem being visible.

## Not done / caveats

- `scripts/build-helper-index.mjs` was **not** re-run (the brief says not to
  touch it, and `support/INDEX.md` is shared with four concurrent agents).
  `support/embedding-hub.ts` needs indexing at the next checkpoint.
- Verified only against the **local** jar (`COMMIT-ID 751c2a98`, 2026-07-18).
  CI builds a merge with master; nothing in this spec pins a data-derived
  magic number, but the hub UI is young and moving.
- No Cypress cross-check was run: nothing here needed one — there is no
  `test.fixme` and no product-bug claim in this port. The single failure was
  port drift and was fixed.

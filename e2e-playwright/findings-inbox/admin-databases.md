# admin-databases (port of `e2e/test/scenarios/admin/databases.cy.spec.js`)

Target: `tests/admin-databases.spec.ts` (18 tests). Support: `support/admin-databases.ts`
(the name the brief asked for — **no deviation**).

Jar confirmed: `/api/session/properties` `version.hash = 751c2a9` == `target/uberjar/COMMIT-ID
751c2a98`. Slot 4102, `--workers=1`.

---

## Collision checks

- `e2e/test/scenarios/admin/` holds a **`databases/` directory** (containing
  `database-writable-connection.cy.spec.ts`) alongside `databases.cy.spec.js`, plus
  `database-connection-strings.cy.spec.ts`. No same-basename `.js`/`.ts` pair — the port is
  of the top-level `.js` file only.
- `e2e/test-component/` has no database specs.
- `tests/` had no `admin-databases.spec.ts`. `database-routing-admin`,
  `database-details-permissions`, `reference-databases`, `admin-datamodel` are ports of
  different sources; none overlaps.

## Infra tier (determined per-describe; the tags mislead in one direction)

| Describe | Tags | Actually needs |
| --- | --- | --- |
| `external databases > enable actions` (2) | `@external @actions` | **container** — restores `mysql-writable`/`postgres-writable`; both snapshots exist locally and `writable_db` lives inside the running `postgres-sample`/`mysql-sample` containers (:5404/:3304). These **execute**, they are not all-skip like `actions-on-dashboards`. |
| `add > external databases > postgres` (1) | `@external` | container (QA postgres :5404) |
| `add > external databases` mongo ×2 | `@external @mongo` | container (mongo :27004) |
| `add > external databases` mysql (1) | `@external` | container (mysql :3304) |
| `add > Google service account JSON upload` (1) | **none** | **no container** — fully mocks `POST /api/database`. Nested under a describe whose *sibling* is `@external`; the tag does not propagate. |
| `database page > side panel` (2) | none | no container, pro-self-hosted token |
| `exceptions` (6) | none | no container |
| `sample database` (2) | none | no container |
| `add database card` (1) | none | no container (snowplow captured at the browser boundary) |

The side-panel engine docs are **not** a network fetch — `useEngineDocMarkdownContent.tsx`
does `import("docs/databases/connections/<x>.md")`, a build-time chunk. No internet needed.

## Results

- Run 1: **16/18**. Both failures were the retroactive-`cy.wait` class (below).
- After fixes: **18/18**, then **36/36** under `--repeat-each=2`.
- **Gate-OFF control** (no `PW_QA_DB_ENABLED`): **6 skipped / 12 passed**, exactly the
  6 container tests. No `afterEach`, so the gate-off teardown trap does not apply.
- Two consecutive full runs green (52.6s, 52.3s) — the spec deletes and recreates the
  Sample Database, and slot state survives because every describe's `beforeEach` restores.
- `bunx tsc --noEmit` clean.
- No fixmes. No test dropped, weakened or merged.

---

## Findings

### 1. 🔴 `usage_info` is an RTK-Query read whose ONLY request fires at page mount — `waitForResponse` at the click can never match

`DeleteDatabaseModal` is rendered **unconditionally** with an `opened` prop
(`DatabaseDangerZoneSection.tsx:77`), so `useGetDatabaseUsageInfoQuery` runs when the
database page mounts, not when the modal opens. Upstream's
`cy.wait("@usage_info")` after the "Remove this database" click is satisfied
**retroactively**. A literal `page.waitForResponse` registered at the click burned the full
30s over a correctly-rendered page.

Same shape for the second `cy.wait("@loadDatabases")` after `goToMainApp()` — satisfied by
the refetch the DELETE already triggered — and for `waitForDbSync`, which calls
`cy.wait("@getDatabases")` **in a loop** (a `waitForResponse` loop deadlocks as soon as the
FE stops refetching the list).

Fix: `ResponseRecorder` (`support/admin-databases.ts`) — a `page.on("response")` recorder
registered **exactly where Cypress registers the intercept**, whose `next()` consumes an
index. This is the general faithful port of "intercept early, `cy.wait` late", and it is
strictly better than creating the `waitForResponse` promise early (which risks an unhandled
rejection if it times out before being awaited). **Generalisable and probably reusable —
worth promoting at consolidation.**

### 2. 🔴 `should handle is_attached_dwh databases` does not test `is_attached_dwh` at all — vacuous UPSTREAM

Mutation M6 removed `res.body.is_attached_dwh = true` from the response patch and the test
stayed **green**. Investigated rather than assumed:

- The disabled "Edit connection details" button and the tooltip
  `"The sample database cannot be edited."` come from `isDbModifiable()`
  (`frontend/src/metabase/common/utils/database.ts:16`), which is false when
  `is_attached_dwh` **OR `is_sample`**. Database 1 *is* the sample database, so all three of
  those assertions hold with the flag absent.
- `cy.findByTestId("database-actions-panel").should("not.exist")` — the only assertion
  actually gated on the flag — **can never match**: `grep -rn "database-actions-panel"
  frontend/ enterprise/frontend/` returns **zero** hits. The testid does not exist anywhere
  in the codebase.

Presence probe under the same mutation (per the "vacuous, or bad mutation?" rule):
`"Sync database schema"` renders only when `!is_attached_dwh`
(`DatabaseConnectionInfoSection.tsx:80`); with M6 applied it **was visible**, proving the
mutation applied and genuinely changed the render — yet none of the test's own assertions
noticed. So: **not a bad mutation, and not port drift — the upstream test is vacuous with
respect to its own subject.** Cypress has identical semantics (`should("not.exist")` on a
never-rendered testid), so it is vacuous upstream too. Ported verbatim with the analysis
inline, per the faithfulness rule.

### 3. `cy.findAllByRole("cell").contains(text)` yields the LINK, not the cell — clicking the filtered cell does not navigate

`page.getByRole("cell").filter({ hasText: /Sample Database/ }).first().click()` lands on the
cell's padding: measured, the URL stayed `/admin/databases/` where
`/admin/databases/2` was expected. Cypress's `.contains` on a subject set returns the
**deepest** matching element (the anchor). Faithful port is
`getByRole("cell").getByText(/…/).first()`. Same family as the existing
"`.contains` is not an exact match" notes, but the load-bearing part here is *depth*, not
case sensitivity — worth a PORTING line.

### 4. The `pro-self-hosted` gate on `database page > side panel` is REAL for one test of two

Probed by removing `activateToken` and changing nothing else:

- `should show side panel with help content…` **fails** — the `Talk to an expert` link is
  gated on `getIsPaidPlan` (`DatabaseHelpSidePanel.tsx:42`).
- `should update the side panel content when the engine is changed` **passes** unlicensed.

Kept the describe-level gate (faithful to upstream's describe-level `activateToken`), but
recording that half the describe is not actually tier-gated. Consistent with the standing
"tier gating does NOT generalise — probe each one" rule.

### 5. No `@OSS` gates in this spec; the EE branches execute

`Cypress.expose("IS_ENTERPRISE")` → `!(await isOssBackend(mb.api))`. The spike backend is an
EE jar, so both enterprise branches run: the Oracle/Vertica engine-list assertions, and the
`exclude_uneditable_details=true` query requirement on the `#20471` intercept (ported
literally so an unfiltered `GET /api/database` still reaches the real backend).

### 6. Token staleness check — no new gaps found

Nothing in this spec touches a post-0.57 feature flag. `pro-self-hosted` supplied everything
the side panel needed (`getIsPaidPlan`). No `transforms-basic`-style gap observed.

### 7. `findByLabelText` exactness matters on this form — did NOT inherit the existing helper

`support/database-routing-admin.ts:131 typeAndBlurUsingLabel` calls `getByLabel(label)` with
**no `exact`**, i.e. substring where testing-library is exact. This form has overlapping
labels (`Port` / `Database name` / `Additional connection string options (optional)`), so
`support/admin-databases.ts` has its own copy that passes `{ exact: true }` for string
labels and passes regexes through. It also captures the element **once** and reuses it for
the blur, avoiding the placeholder-trap re-resolution. Flagging the routing-admin copy as a
latent hazard for whoever consolidates these (there are now ≥4 copies:
`database-routing-admin`, `sso-saml`, `sso-google`, `admin-databases`).

### 8. `.trigger("mouseenter")` on the Host info icon — deliberate deviation to a real hover

Mantine's Tooltip listens through React's synthetic `onMouseEnter`, which React synthesises
from delegated `mouseover`; a dispatched `mouseenter` does not reach it. Ported as a real
`hover()`. Works; recorded as a deviation rather than a silent substitution.

---

## Mutation testing

Nine independent per-test mutants in one batch, then four follow-ups aimed at tails.
**All inverted the INPUT, never the expectation.**

| # | Mutation | Result | Died at |
| --- | --- | --- | --- |
| M9 | `PUT database-enable-actions:false` before visiting (both dialects) | killed ×2 | the `settings` assertion (#4 of 5) |
| M8 | Display name typed `QA Postgres13` | killed | `database-header-section` toContainText (body #4 of 6) |
| M2 | Upload `{"foo": 999}`, assertion untouched | killed | final assertion |
| M10 | Engine loop: name `Snowflake` with file `mysql` | killed | the `href` attribute assertion |
| M3 | Mocked 400 body → `SOMETHING COMPLETELY DIFFERENT` | killed | the only assertion |
| M4 | Mocked 500 `message` → a different string | killed | **final** assertion (errorMessage visible after "Show error details") |
| M5 | Never type the DB name into the confirmation input | killed | `deleteButton` toBeEnabled |
| M7 | Click the *first* browse link instead of the last | killed | at the **click** — so the snowplow assertion stayed unproven → follow-up M7b |
| M6 | Drop `is_attached_dwh` from the patched response | **SURVIVED** | see finding #2 |

Follow-ups aimed at the tails M8/M5/M7 left unproven:

| # | Mutation | Result | Died at |
| --- | --- | --- | --- |
| M8b | `editDatabase()` not called | killed | the post-edit `data-checked` assertion (body #5) |
| M5b | Never click "Bring the sample database back" | killed | the cell click after restore (test tail) |
| M7b | Reach `/admin/databases/create` by `page.goto` instead of the click | killed | the **snowplow event** assertion — capture is load-bearing |
| M6b | M6 + presence probe for `"Sync database schema"` | probe passed, test still green | proves M6 applied; see finding #2 |

12 killed / 1 survivor, and the survivor is explained (an upstream-vacuous assertion on a
testid that does not exist), not hand-waved.

---

## Housekeeping / for the orchestrator

- **`support/INDEX.md` NOT regenerated.** `node scripts/build-helper-index.mjs` rewrites a
  shared file and sibling slots are live; the brief forbids touching shared files. Please run
  it at the next consolidation checkpoint — `support/admin-databases.ts` adds
  `ResponseRecorder`, `waitForDbSync`, `visitDatabase`, `typeAndBlurUsingLabel`,
  `patchJsonResponse`, `expectConcatenatedTextToContain`, `pathnameIs`, `pathnameMatches`,
  `button`, `labeled`, `fieldInfoIcon`, `selectFieldOption`, `chooseDatabase`,
  `toggleFieldWithDisplayName`, `editDatabase`.
- **PORTED.txt not touched** (per brief). Entry to add when landing:
  `admin/databases.cy.spec.js`.
- Consolidation candidates surfaced: `typeAndBlurUsingLabel` (≥4 copies, one of them
  substring-buggy — finding #7); `ResponseRecorder` is a general answer to the
  intercept-early/wait-late pattern and belongs somewhere shared.

---

## Three-line summary

Ported all 18 tests of `admin/databases.cy.spec.js` faithfully; 18/18 green, 36/36 under
`--repeat-each=2`, gate-OFF control 6 skipped/12 passed, tsc clean, slot state survives two
consecutive runs. The two run-1 failures were both the retroactive-`cy.wait` class, fixed
with a general `ResponseRecorder` rather than per-site hacks. Mutation testing killed 12 of
13 mutants; the survivor is a genuine upstream vacuity — `should handle is_attached_dwh
databases` asserts nothing gated on that flag, and its one flag-gated assertion targets a
`data-testid` that exists nowhere in the codebase.

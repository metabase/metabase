# database-routing-admin

Port of `admin/database-routing/database-routing-admin.cy.spec.ts` →
`tests/database-routing-admin.spec.ts`. New helpers in
`support/database-routing-admin.ts` (imports shared ui/charts/admin-permissions
read-only). All 15 tests ported faithfully; issue-free (no upstream `metabase#`
numbers in this spec). tsc clean.

## Runtime status: RESOLVED — the spec runs, and is green (2026-07-21)

> **The "infra-gated" claim below is superseded.** CI now provisions the QA
> containers and sets `PW_QA_DB_ENABLED=1`, so the whole spec executes. Latest
> run: **14 passed, 1 skipped (OSS-gated), 0 failed.** Three tests were
> genuinely broken and are fixed (async `PUT /api/database/:id` race; a
> `hover()` retarget; two stacked undo toasts). Ten of the fifteen tests had
> never actually executed before this.
>
> Caveat kept deliberately: that is a **single** green run. Test 1 is long and
> serial and failed at three progressively later points before passing, so it
> is not yet established as flake-free — `--repeat-each=3` is what would
> justify that claim.

## Runtime status (SUPERSEDED): INFRA-GATED (correctly skipped)

The whole spec restores the `postgres-writable` snapshot and drives
WRITABLE_DB_ID (the writable QA postgres, port 5404). Destination "mirror"
databases are **real postgres connections** — creation POSTs with
`check_connection_details=true`, and the health tooltip asserts "Connected".
Neither the snapshot nor the QA postgres is provisioned in this spike (port 5404
closed, no docker), so the spec is gated on `PW_QA_DB_ENABLED` and SKIPS on the
jar — same class as transforms-codegen / remote-sync / actions-on-dashboards.

Verification on the jar (slot 2): **15 skipped**, and **30 skipped** under
`--repeat-each=2`. Faithful-by-construction; green here means "correctly
skipped", not "passing". The EE describe is additionally token-gated
(pro-self-hosted); the OSS test is gated on an OSS build (this backend is EE).

## Tooltip capability probe — VERDICT: CONFIRMED (2026-07-21)

> **Superseding the "unverifiable" verdict below.** The exact settling
> conditions it specified have now been met: run with `PW_QA_DB_ENABLED=1`
> against a live writable QA postgres. The probe **executed and passed**.
>
> Real Playwright `hover()` fires the Mantine Tooltip where Cypress headless
> needed a synthetic `cy.trigger("mouseenter")` (the Chrome v122+ issue). The
> mechanism, established while fixing a separate hover timeout in this spec:
> the disabled `<input>` is a *descendant* of the wrapper Box, and React's
> synthetic `onMouseEnter` fires for descendants, so a pointer landing on the
> input still triggers the wrapper's handler. Cypress's problem was never that
> the gesture was impossible — it was that CDP hit-testing resolved to the
> disabled input and Cypress had no way to express "hover the wrapper".
>
> Scope honestly: this is one probe passing in one spec. It is a real
> dividend, not a general claim that Playwright fixes every v122+ hover.

## Tooltip capability probe (SUPERSEDED): VERDICT: UNVERIFIABLE

The special-interest test is `assertDbRoutingDisabled`, the disabled-toggle
tooltip. Upstream had to work around Chrome v122+ headless: `realHover()` on the
`#database-routing-toggle` area was unreliable because CDP hit-testing resolved
to the disabled `<input>` inside the Mantine Switch and swallowed the boundary
events, so it used `cy.trigger("mouseenter")` (a synthetic dispatch on the Box
wrapper) instead. (Matches MEMORY.md's v122+ persistent-failure note.)

The port uses Playwright's **real `hover({ force: true })`** on
`database-routing-toggle-wrapper` — the capability probe the brief asked for.
`{ force: true }` is required because Playwright's actionability would otherwise
refuse to hover a point occupied by the disabled control on top (the same
hit-test that defeated Cypress).

**It could not be exercised.** The tooltip path only runs after the
postgres-writable setup, which needs the QA postgres this spike lacks — so the
probe never actually executes here. Per the fidelity rule (never claim a
capability/bug without running it), **no dividend is claimed**. To settle it,
run with `PW_QA_DB_ENABLED=1` against a live writable QA postgres and check
`assertDbRoutingDisabled` under `--repeat-each=3`; if real `hover()` fires the
tooltip stably where Cypress headless couldn't, that would be the dividend
(parallel to the kbar-shortcut finding).

## Port mechanics (all standard)

- 3 beforeEach cy.intercept aliases (@createDestinationDatabase / @databaseUpdate
  / @deleteDatabase) → `waitForResponse` predicates registered before the
  triggering action, awaited after (rule 2).
- findByText/findByLabelText/findByRole string args → `{ exact: true }` (rule 1);
  regex args (`/Add/`, `/Slug/`, `/(Failed|Save)/`) ported as-is.
- Mantine Switch toggles → click the labeled input with `{ force: true }`
  (rule 4); covers both upstream's `.click({ force: true })` and its
  `.parent("label").click()` (same control).
- Duplicate test title in the "Table editing" describe → second suffixed " (2)"
  (Playwright treats dup titles as a hard load error).
- `H.typeAndBlurUsingLabel` re-ported locally (regex-label capable) — the shared
  `ai-controls.typeAndBlur` is string-exact only, and this form matches fields by
  `/Slug/`, `/Host/`, etc.
- attached-DWH test's `cy.intercept` response-mutation → `page.route` +
  `route.fetch()` + `route.fulfill({ response, json })`.
- `.scrollIntoView().should("be.visible")` → `scrollIntoViewIfNeeded()` +
  `toBeVisible()`.
- `_.range(2,7)` inlined as `[2,3,4,5,6]` (underscore not imported).

## Consolidation note (later pass)

`typeAndBlurUsingLabel` (regex-label variant) is a recurring shape; the shared
`ai-controls.typeAndBlur` is string-exact only. A regex-capable
`typeAndBlurUsingLabel` in a shared module would collapse this re-implementation.

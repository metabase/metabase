# application-permissions

Source: `e2e/test/scenarios/permissions/application-permissions.cy.spec.js` (238 lines)
Target: `e2e-playwright/tests/application-permissions.spec.ts`
New support module: `e2e-playwright/support/application-permissions.ts`

**Result: 6/6 passing on the jar, 12/12 under `--repeat-each=2`, `tsc --noEmit` clean.
Zero gate-skips, zero fixmes, zero product-bug claims.**

Backend verified as the jar, not a stale source-mode slot: `/api/session/properties`
`version.hash` = `751c2a9` (matches `target/uberjar/COMMIT-ID` `751c2a98`), `/` serves
hashed static assets (`app-main.2968ba045c7df524.js`), process is
`java -jar target/uberjar/metabase.jar`, and `token-features.advanced_permissions` is
true. Worth stating because the run is fast enough (1–2s/test) to look vacuous.

## Fixes and their category

**No fixes were needed.** The port was green on its first jar run and stable on the
repeat. Nothing in it required debugging, so there are no fixes to classify — this is a
clean "no dividends on the fix axis" port.

The batch-12 `MultiAutocomplete`/`PillsInput` submit gotcha the brief flagged **did not
apply**: this spec's only form input is the admin `Site name` `TextInput`, and the
permission popovers are plain option lists. Recording the negative so the next
permissions port doesn't go looking for it.

## Vacuous upstream assertions (dividends)

Three of upstream's `should("not.exist")` checks are absence-of-X inside a container that
the test never asserts is present. Each passes just as well if the container never
rendered — i.e. they can be satisfied by the page being broken. All three were ported
with a real gate on the container first, and **all three still pass**, so the gates are
now load-bearing rather than decorative:

1. **The strongest one.** `cy.findByTestId("notifications-list").within(() =>
   cy.icon("close").should("not.exist"))`. The test's whole claim is "the subscription is
   listed but the user cannot remove it" — yet an empty notifications list satisfies it
   identically. Port asserts `getByText("Subscription")` is visible inside the list
   before counting close icons. Verified: the subscription *is* listed, and the
   unsubscribe icon *is* absent. The upstream assertion was true but for reasons it never
   established.
2. `H.sharingMenu().findByText(/subscri/i).should("not.exist")` — vacuous if the sharing
   menu failed to open. Port asserts `sharingMenu` is visible first.
3. `H.popover().findByText(adminAppLinkText).should("not.exist")` — vacuous if the
   profile popover failed to open. Port asserts the popover is visible first.

Also note the **inverse** case, which is *not* vacuous and was ported as a real
assertion: bare `cy.findByText(...)` / `cy.findAllByText(...)` with no `.should` still
throw when nothing matches, so the permissions-help panel's two text checks and the
"Save permissions?" modal texts are genuine existence assertions.

Per the batch-8–11 rule, every `should("not.exist")` was ported as a **non-retrying**
`expect(await loc.count()).toBe(0)` at a defined instant, not a retrying
`toHaveCount(0)` — matching the original's strength rather than silently raising it.

## Porting gotchas worth adding to PORTING.md

**`H.setupSMTP()` is often over-specified — check whether the spec ever reads an inbox.**
`setupSMTP` PUTs `/api/email`, which *live-validates* the SMTP connection and therefore
requires the maildev container; porting it faithfully would have gated the "grants ability
to create dashboard subscriptions and question alerts" test behind a container we don't
run. But that test never reads mail — it only needs the *"email is configured"* state so
the Subscriptions sidebar and the alert modal appear. `configureSmtpSettings`
(`support/admin-extras.ts`) writes the identical settings through the bulk
`PUT /api/setting` endpoint, which skips connection validation. Swapping it kept the test
**executable on the bare jar instead of gate-skipped**.

Generalisable rule, and the same shape as the batch-8–11 "audit a spec's snapshot/gate
dependencies while porting" note (`custom-viz` restoring `postgres-writable` it never
touched): **a container dependency inherited from a helper is not automatically a real
dependency of the test.** Ask what state the assertions actually need. Here it converted
1 test from gate-skipped to genuinely executed; the same question is worth asking of every
`setupSMTP` call site in the remaining queue.

## Consolidation debt

Nothing new was duplicated — the brief's instruction to reuse the permissions-graph
surface held, and `updatePermissionsGraph` was not needed at all (this spec drives the
permissions UI and uses `saveChangesToPermissions`). But porting it surfaced three
existing duplications:

- **`saveChangesToPermissions` is the canonical third copy of a trio already half-flagged.**
  PORTING.md's batch-12 list notes `savePermissionsGraph` (data-model-permissions.ts) ≡
  `saveAndConfirmPermissions` (download-permissions.spec.ts, spec-local). Add
  `saveChangesToPermissions` (command-palette.ts) — and make **it** the survivor: it is
  the only one of the three that ports upstream's `cy.wait("@updatePermissions")`, it
  scopes the button to `edit-bar` exactly as `H.saveChangesToPermissions` does, and
  Cypress has exactly one copy, so consolidating toward it stays faithful. This port
  imports it read-only rather than adding a fourth.
- **`modifyPermission` exists twice**: `admin-permissions.ts` (full upstream signature,
  including the propagate-to-children switch and the toggle-only `value === null` case)
  and `command-palette.ts` (3-arg subset). Upstream has one. Collapse onto the
  `admin-permissions.ts` version — it is a strict superset and this port uses it.
- **`adminAppLinkText` / `mainAppLinkText` live in `support/custom-viz.ts`.** They are
  generic nav-label constants from `e2e-ui-elements-helpers.js`; importing them from a
  visualization module to write a permissions test is a smell. They belong in `ui.ts`.

Previously-flagged items this port also touched, no new information:
`undoToast` (metrics.ts) ≡ `undoToastList` (organization.ts); `sidebar`
(download-permissions.ts) and `main` (ui.ts) are both `H.sidebar`/`H.main` ports.

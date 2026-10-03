# tenants (slot 3, port of `e2e/test/scenarios/admin-2/tenants.cy.spec.ts`)

Target: `tests/tenants.spec.ts` (+ `support/tenants.ts`). 1059 source lines → 12 tests
across 4 describes. No prior port of this source existed (the five tenant siblings are
different specs).

Jar confirmed: slot-3 backend PID 8885 = `java -jar target/uberjar/metabase.jar`,
`COMMIT-ID 751c2a98` (local jar, 2026-07-18). CI builds a merge with master (#79), so
this is not proof about CI.

---

## 1. Infra tier — the classifier is wrong here (three ways)

**This is NOT a QA-DB spec.** It is *mixed*, and 10 of 12 tests need no container at all.

| Tests | Needs | Gate |
|---|---|---|
| 10 | nothing — `default` snapshot + EE token | — |
| 1 — *"should not show send email modal … when SMTP is configured"* | **maildev** (`H.setupSMTP` PUTs `/api/email`, which live-validates the connection) | `isMaildevRunning()` |
| 1 — *"should show tenant attributes in user attribute lists …"* | **writable QA postgres** (`H.restore("postgres-writable")` + `WRITABLE_DB_ID`) | `PW_QA_DB_ENABLED` |

Nothing here needs mongo, mysql or webhook-tester. Container evidence for those: **n/a**.

The `@external` tag on this file is doing three unrelated jobs at once; treating it as
"needs a QA database" would have skipped 11 executable tests. Fourth data point for the
brief's warning.

## 2. Executed vs gate-skipped, with the gate-OFF control

| Run | Result |
|---|---|
| Gate ON (`PW_QA_DB_ENABLED=1`, maildev up) | **12 passed, 1 skipped** |
| Gate ON, `--repeat-each=2` | **24 passed, 2 skipped** |
| **Gate OFF control** (no `PW_QA_DB_ENABLED`) | **11 passed, 2 skipped** |

The single always-skipped test is the `@OSS` describe (`isOssBackend` false — the spike
backend is EE). The gate-off control skips exactly one *additional* test, by name:
`should show tenant attributes in user attribute lists when multi tenancy is enabled`.
So the QA-DB gate is correctly scoped to one test rather than the file, and the numbers
mean what they say. No `afterEach` exists, so the #67 "afterEach after a skipped
beforeEach" trap does not apply.

`bunx tsc --noEmit` clean throughout. **No fixmes.** Zero product-bug claims.

## 3. The token gate IS real — measured, not assumed

Two independent measurements, because "activateToken didn't throw" proves nothing:

**(a) `token-features` actually flips.** Via `curl` against :4103 with a real admin
session (avoiding the `.body`-is-a-method trap entirely):

```
with pro-self-hosted : {tenants: true,  sandboxes: true,  sso_jwt: true,  advanced_permissions: true}   42 features true
after deleting token : {tenants: false, sandboxes: false, sso_jwt: false, advanced_permissions: false}   0 features true
```

**(b) Removing the token breaks the spec.** Ran a copy with the three
`activateToken("pro-self-hosted")` calls removed and *nothing else changed*:

> **11 failed, 1 passed, 1 skipped.**

The single survivor is verbatim `should disable the feature if the token feature is not
enabled` — which deletes the token itself, so removing `activateToken` is a no-op for it.
Backend errors are explicit: `POST /api/permissions/group -> 402 "Tenants is a paid
feature not currently available to your instance."`

This is the **`common-ee` shape**, not the `select-embed-options` shape — confirming the
brief's point that tier gating does not generalise, now with a third measured instance.

## 4. Vacuous upstream assertion found: `navbar-new-collection-button`

`tenants.cy.spec.ts:877-880` ends the JWT test with

```js
H.navigationSidebar().findByTestId("navbar-new-collection-button").should("not.exist");
```

**That testid does not exist in the product and never has.**
- `grep -rn` over `frontend/src` + `enterprise/frontend/src`: **0 hits**. The only
  occurrence anywhere in the working tree is the Cypress spec itself.
- `git log --all -S"navbar-new-collection-button"` finds it introduced by the tenants PR
  (#66661) **in the spec only** — it was never implemented.
- Probed directly rather than inferred from source: I ran the same locator as an
  **admin** on the same page (who unambiguously *does* have a new-collection affordance).
  Result **0**. The locator cannot match for any user, so the assertion cannot fail.

Cypress and Playwright have identical semantics here, so this is **vacuous upstream**,
not port drift and not a Playwright weakness. Per the faithfulness rule it is ported
verbatim with the analysis inline; I added one clearly-labelled render anchor next to it
(a `Home` sidebar link visibility check) which does not rescue the dead selector but does
stop the surrounding step passing on a blank page.

Same family as the two disabled-by-typo sandboxing assertions, but a new sub-mechanism:
**an assertion written against a testid the implementation never shipped.** Cheap sweep
available: any `findByTestId(...).should("not.exist")` whose testid has zero hits in
`frontend/`.

## 5. Mutation testing — 6 mutants, all killed / conclusive

Inverting the **input** each time, and aimed at different depths.

| # | Mutation (input) | Outcome | Died at |
|---|---|---|---|
| M1 | sandbox `attribute_remappings` key `@tenant.slug` → `@tenant.NOPE` | **killed** | head — CATEGORY cells never render (sandbox query errors) |
| M2 | probe: same `navbar-new-collection-button` locator, as **admin** | **survived → proved vacuity** (§4) | n/a |
| M3 | UXW-2624 group `is_tenant_group: true` → `false` | **killed** | assertion 2 — reads `Can view`, not `Blocked` |
| M4 | test-4 `Favorite tenant users` `is_tenant_group: true` → `false` | **killed** | **assertion 8 of 10** (`expectGlobeIcon` on the tenant group) |
| M5 | drop `setupSMTP` from the SMTP test | **killed** | **the tail** — `expect(modal).toHaveCount(0)`, the test's only real assertion |
| M6 | create `Gizmos` tenant **without** default attributes (QA-DB test) | **killed** | **the final assertion block** — `CAPS` attribute not visible |

M4/M5/M6 exist specifically because M1/M3 both died at the head. Notes:

- **M4 is the strongest**: the mutated run still resolved the group's *text* in the
  permission table and failed only on the globe icon — so `globeIconFor` is a sound
  locator that can both match and miss. That retroactively validates the paired
  **`expectNoGlobeIcon`** absence checks (Administrators / All internal users) as
  non-vacuous.
- **M5** proves the maildev dependency is load-bearing: without SMTP configured the
  send-email modal really does appear, so the test is not a no-op smoke test.
- Separate **can-this-locator-ever-match probe** for the other tail absence check in the
  big test — `getByRole("button", { name: "group-action-button" })` inside the
  `All tenant users` row. On the *Internal groups* page rendered moments earlier the same
  locator resolves and is visible (**probe passed**), so the `toHaveCount(0)` is real.
- The `toHaveCount(0)` tails in EMB-1143 / UXW-2624 are anchored by preceding
  `toBeVisible()` assertions on text in the *same* modal, so they cannot pass on an
  unrendered page.

## 6. FINDINGS #45 — no new evidence

This spec never touches the entity-picker move flow or `/api/search?context=entity-picker`.
Its tenant-collection surface is admin permissions (`/admin/permissions/tenant-collections/root`),
which reads the collection graph, not search. **Nothing here bears on #45 either way**, and
I did not go looking outside the port's scope.

## 7. Port gotchas worth promoting

1. **🔴 `/auth/sso` through `mb.api` poisons the harness's cookie jar, and
   `signInAsAdmin()` cannot undo it.** Porting the beforeEach's
   `cy.request("GET", "/auth/sso?jwt=…")` onto `mb.api.get` provisions the user *and*
   leaves a `Set-Cookie: metabase.SESSION` for that tenant user in the
   `APIRequestContext`'s own jar. The backend prefers the cookie over the
   `X-Metabase-Session` header, and `mb.signInAsAdmin()` only re-sets cookies on the
   **browser** context — so every later admin API call silently runs as the last
   provisioned tenant user. Measured: `POST /api/card -> 403 You don't have permissions
   to do that` in all four tests of that describe. Cypress never saw this because
   `cy.request` shares the browser jar, which `signInAsAdmin` *does* replace.
   **Fix**: a bare `fetch(..., { redirect: "manual" })`, which provisions and discards the
   cookie. Generalises to any port that drives an auth endpoint through `mb.api` —
   `/auth/sso`, and presumably SAML/OAuth callbacks too.
2. **`cy.get(sel).should("contain.text", x)` on a MULTI-element subject is a
   concatenation, not a per-element or first-match check.** chai-jquery reads
   `$el.text()` across the whole set. `[data-column-id=CATEGORY]` resolves to 19
   gridcells, so `toContainText` is a strict-mode violation and `.first()` would
   *strengthen* the assertion into "row 1 says Gizmo". Faithful port: join
   `allInnerTexts()`. Same family as rule 3's ANY-of-set case but the opposite
   semantics — `should("be.visible")` is any-of, `should("contain.text")` is the
   concatenation. Worth adding next to rule 3, which currently only covers the former.
3. **`fill()` defeats a Formik form whose submit is gated on `dirty` + a derived
   sibling field.** `TenantForm`'s name input carries a custom `onChange` that slugifies
   into `slug`; with `fill()` the slug assertion *passed* (`"parrot"`) yet the
   `Create tenant` button stayed `disabled` for the full 30s. Real keystrokes
   (`click` + `pressSequentially`, PORTING rule 5) fix it. The misleading part is that
   the intermediate assertion passes, so it does not look like a typing problem.
4. **A `.click({ force: true })` on a tab immediately after closing a confirm modal hits
   the unmounting overlay.** Textbook instance of the documented force-click trap: the
   "Deactivated" tab stayed unselected, the *Active* list rendered fine (empty), and the
   failure surfaced as `"3 people found"` not found — i.e. it reads as a data bug.
   `dispatchEvent("click")` is the faithful port of Cypress's force.
5. **The tenants route guard loses a race against a just-written `use-tenants`.** A
   `page.goto("/admin/people/tenants/people")` can get bounced to `/admin/people`, which
   renders the *internal* users list perfectly — so the next step fails with "row not
   found" rather than "wrong page". Hit once in 4 runs. Upstream already knows about this
   (`createTenantGroupFromUI` carries `// FIXME shouldn't be necessary - caused by slow
   route guard` and re-clicks the sidebar link). Ported the same workaround as a retried
   navigation (`visitTenantUsers`), which is a retry of the visit, not a changed assertion.
6. **Admin `Switch` needs `toBeEnabled()` + a post-condition.** `useAdminSetting`'s
   `isLoading` keeps the database-routing switch disabled briefly; a `click({force:true})`
   on it silently no-ops and the failure surfaced 30s later as "the *Choose an attribute*
   placeholder doesn't exist". Already in PORTING; confirming it bites on
   `/admin/databases/:id` too.
7. Two upstream calls pass arguments testing-library discards, ported as the plain query
   with the argument dropped and documented inline:
   `cy.findByTestId("admin-pane-page-title", { name: GROUP_NAME })` and
   `cy.findByText("Tenant users", 1000)`. Neither is vacuous — the testid/text queries
   themselves are real — but neither asserts what it appears to.

## 8. What I did NOT verify

- **No Cypress cross-check was run** — four sibling slots were live and the standing rule
  forbids it. Every failure I hit had an identifiable Playwright-side mechanism (§7), so
  none needed a fidelity check; correspondingly, **no fidelity claim is made here.**
- Only the **local** jar (`751c2a98`, 2026-07-18). Not verified against a CI merge jar.
- The `@OSS` test has never executed anywhere in this spike (EE backend). Its port is
  faithful-by-construction only. Noting the brief's caveat: because it asserts the
  *absence* of the tenants route and gear link, and both are token-feature gated rather
  than `PLUGIN_IS_EE_BUILD` gated, it would likely read correctly on an unlicensed EE jar
  — but I did not test that, and it stays gated on `isOssBackend` to mirror upstream.
- Slot hygiene checked: the spec leaves `use-tenants: true` and 42 token features on the
  backend, but `POST /api/testing/restore/default` clears both (measured: 42→0,
  `true`→`false`), so siblings that restore are unaffected. Two consecutive full green
  runs after the mutation work confirm the slot is not poisoned.

---

## Summary

1. **Not a QA-DB spec**: 10/12 tests need no container, 1 needs maildev, 1 needs the
   writable QA postgres — gate-OFF control confirms exactly one extra skip (12+1 → 11+2).
2. **The EE token gate is real** — `token-features` measurably flips 42→0 and removing
   `activateToken` fails 11 of 12 tests with explicit 402s, the survivor being the one
   test that deletes the token itself.
3. **One vacuous upstream assertion found and left faithful**: `navbar-new-collection-button`
   has never existed in the product, proven by an admin-side can-it-ever-match probe; six
   mutants otherwise all killed, three of them at genuine tail assertions.

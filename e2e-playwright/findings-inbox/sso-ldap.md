# sso-ldap — port findings (SLOT 3, port 4103)

Source: `e2e/test/scenarios/admin-2/sso/ldap.cy.spec.js` (257 lines, 14 tests, 2 describes)
Target: `e2e-playwright/tests/sso-ldap.spec.ts`
Support: **`support/sso-ldap.ts`** — matches the expected name. No shared module edited.

> Rewritten after the coordinator started the OpenLDAP container. Pass-1 (no server)
> conclusions that turned out to be measurement artifacts are corrected and labelled
> inline, not silently dropped.

## Headline

**All 14 tests execute and pass. 42/42 under `--repeat-each=3`.** Nothing is skipped.

Getting there required fixing **three defects in my own port**, two of which a green run
could not see and only mutation exposed:

1. A strict-mode violation (`getByText("Password")` also matched "I seem to have forgotten
   my password") — caught by the first live run.
2. **A vacuous absence assertion** in the OSS user-provisioning test, passing pre-render.
3. A bad mutation of mine that briefly looked like a third product defect but was not.

## Collision check

`grep -rl "sso/ldap\|sso-ldap\|ldap" tests/ support/` → `tests/user-settings.spec.ts`,
`tests/admin-authentication.spec.ts`, `tests/onboarding-sso.spec.ts`. None ports this source
(a `sso_source: "ldap"` stub, a `getByTestId("ldap-setting")` visibility check, a
`["ldap","google"]` loop). `support/sso-ldap.ts` did not exist.

## LDAP server

Running: `metabase-e2e-ldap-1`, `bitnamilegacy/openldap:2.6.4`, `0.0.0.0:389->389`. TCP 389
open, verified from inside the test process.

The `ldapReachable()` TCP gate is retained deliberately. It is not dead code: it is the only
thing between "no container" and a confusing 10-test cascade, and it emits an actionable skip
message naming the exact `docker compose up ldap -d` command. Confirmed working — it produced
the 10 clean skips in pass 1.

**Why the dependency is hard, not soft:** `PUT /api/ldap/settings`
(`src/metabase/sso/api/ldap.clj`) calls `ldap/test-ldap-connection` and returns **500** unless
the bind succeeds, persisting nothing on failure. `setupLdap()` is that request, so it cannot
be stubbed. Mutation M7 re-confirms this from the opposite direction.

## Credentials

Now `process.env.MB_E2E_LDAP_BIND_PASSWORD ?? <compose value>`, likewise the user password,
per the coordinator's ruling. These are fixture values already committed in plaintext to
`e2e/test/scenarios/docker-compose.yml` (service `ldap`), not secrets. The env override is
retained so a differently-provisioned server can be targeted without editing source.
**No credential value appears in this file, in any log line, or in any assertion message.**

## Executed vs skipped

**14 executed, 14 passed, 0 skipped.** `--repeat-each=3` → **42 passed**, no flake.

Pass 1 (no container) was 4 passed / 10 skipped. Every claim below is now backed by execution
rather than code-reading.

## Defect 1 — strict-mode violation (#25661)

`page.getByText("Password")` resolved to 2 elements: the field label and the "I seem to have
forgotten my password" link. **Playwright `getByText` defaults to case-insensitive SUBSTRING
matching**; Cypress `findByText(string)` is exact on normalised text. Fixed with
`{ exact: true }` — the *faithful* port, not a tightening. Both labels have no nested children,
so testing-library's direct-child-text-nodes reading and Playwright's full-`textContent`
reading agree here; I checked those specific nodes rather than assuming the general rule.

## Defect 2 — a vacuous absence assertion (the important one)

`should not show the user provision UI to OSS users` was passing **for the wrong reason**.

Found by **M6: grant the EE token to the OSS denial test and require it to go red.** It
**survived** — the denial assertion passed even with `sso_ldap` active.

Root cause, measured: the User Provisioning section is a separate plugin component whose
`AdminSettingInput` returns `null` while its own settings query loads, so it commits **~550 ms
later than the form fields**:

```
[after LDAP Host visible]      widget=0   text=0
[after submit button visible]  widget=1   text=1
widget appeared 552ms after goto
```

`toHaveCount(0)` therefore fired against a page where the section had not yet rendered.
**`toHaveCount(0)` retries, but a zero-assertion is satisfied on its very first poll** —
retrying does not rescue a negative assertion from a pre-render race. This is the "empty state
renders pre-fetch is not a valid anchor" hazard in its nastiest form.

Fixed by anchoring on the `GET /api/setting` response **and** the submit button being visible
before asserting absence. **Proven, not assumed: M6 re-run against the anchored version KILLS.**
The spec carries an anchor comment recording this so nobody "simplifies" it back.

### This retracts a pass-1 "unexplained"

Pass 1 recorded as *unexplained* that User Provisioning rendered nothing even with
`sso_ldap=true`. That was **my own measurement artifact** — the same pre-render race, inside a
probe. With a live server it renders correctly and the OSS/EE distinction is real. Nothing
mysterious remains. Recording the retraction rather than deleting the claim.

## Defect 3 — a bad mutation of mine (called out)

**M10** changed test 3's post-Pause assertion from `"Paused"` to `"Active"` and **survived**. I
first hypothesised `getByText("Active")` was matching `"Deactivate"` via case-insensitive
substring. **That hypothesis was wrong** — probed directly:

```
[after pause] innerText="LDAP\nPaused\n…\nEdit"   getByText("Active")=0
```

The real reason: `await waitForUpdateSetting(...)` resolves a tick **before React commits**, so
the mutant asserted against stale pre-update DOM. That makes M10 a **bad mutation** — it swaps
one positive assertion for another that is transiently true, so it says nothing about whether
the original is vacuous.

Replaced with **M11: delete the Resume action, keep its assertion** — which **KILLS**. Test 3 is
sound and load-bearing. No code change needed; the defect was in my mutation, not the port.

## Gate mapping

`@external` is **accurate and load-bearing** — not stale, over-broad, or a red herring. The
gate-OFF control is pass 1 in full: container absent → exactly 10 tests cannot run and exactly 4
can (the 4 that never touch the server); container present → all 14 run. Clean split matching
the tag's intent.

`beforeEach` read in both describes. **Neither has an `afterEach`**, so the describe-level-skip
requirement is inapplicable — verified by mechanism, and separately confirmed empirically in
pass 1 that skipped tests reported as *skipped*, not *failed*.

## Token predicate — split by argument, both arms run

`:sso-ldap` is a hard `define-premium-feature` (`premium_features/settings.clj:165`), documented
as *"advanced configuration for LDAP authentication"*. **Split by argument:**

- Basic LDAP **login** is OSS — which is why upstream's "user login on OSS" test sits in the
  **untokened** describe. **Now executed and passing, proving it directly.**
- Attribute sync + user provisioning are gated: `enterprise/.../sso/integrations/ldap.clj`
  `find-user` and `check-provision-ldap` both carry `:feature :sso-ldap`.

**BE and FE agree:** BE exposes `:sso_ldap` in token-features (`settings.clj:430`); FE gates
`PLUGIN_LDAP_FORM_FIELDS` on `hasPremiumFeature("sso_ldap")`
(`enterprise/frontend/src/metabase-enterprise/auth/index.ts:92`).

**Arms run:** OFF → provisioning absent (test 4, now genuinely load-bearing). ON → provisioning
renders and is togglable (test 12) and LDAP attributes sync (test 14, `uid` / `homedirectory`).
M6 is the formal two-arm control and it kills.

### Token hygiene

Pass 1's leak fix is **preserved**: the EE describe gates on LDAP *before* `activateToken`, so a
skip can never leave a token active. That failure mode is now unreachable.

With the container up the EE tests genuinely run, so the last one naturally leaves the token set
— **exactly as the already-landed `sso-jwt` and `sso-saml` ports do** (neither has any
`afterAll`/`afterEach`; the harness contract is restore-at-*start*, and every spec's `beforeEach`
calls `mb.restore()`). I did not diverge from that convention.

**Slot 3 was nevertheless explicitly cleaned and re-measured: `features true = 0`,
`sso_ldap = False`, `ldap-enabled = False`.**

## Mutation testing

Verifier sanity-checked before use (M1 run first purely to confirm the harness reports RED — it
did). Every mutation used an anchored replace asserting `count == 1` and read the file back
(`MUTATION LANDED: True` each time).

| # | Mutation | Aimed at | Result |
|---|---|---|---|
| M1 | schema msg `"…greater than 0"` → `…9999` | assertion, t6 | killed |
| M2 | `"Wrong host or port"` → `"…porx"` | assertion, t7 | killed |
| M3 | input `enterLdapPort("1")` → `("389")` | **input inversion**, t7 | **killed** (survived pre-container) |
| M4 | `crudGroupMappingsWidget(…,"ldap")` → bogus method | input, t10 | killed (head) |
| M5 | tail `expectDisplayValueCount(…,"localhost")` → `"localhos"` | **tail**, t7 | killed |
| M6 | **activate `pro-self-hosted` in the OSS denial test** | **access grant**, t4 | **survived → defect → KILLS after fix** |
| M7 | break LDAP **bind** password | **credential inversion** | **10 killed, 4 survived** |
| M8 | break LDAP **login user** password | **credential inversion** | 2 killed (exactly t9 + t14) |
| M9 | tail `"homedirectory"` → `"homedirectoryX"` | **tail**, t14 (EE attr sync) | killed |
| M10 | post-Pause `"Paused"` → `"Active"` | t3 | **survived — BAD MUTATION (mine), see Defect 3** |
| M11 | delete Resume action, keep its assertion | t3 | killed |

**M3 is the reversal the coordinator predicted.** Pre-container it survived because 389 and 1
both yielded "Wrong host or port" with nothing listening. With a real server it **kills**: 389
succeeds, 1 fails. **#16226 is genuinely load-bearing, not "data cannot discriminate".** The
earlier verdict is retracted.

**M7 is the cleanest result in the set.** Breaking the bind password kills exactly 10 tests and
spares exactly 4 — and the 4 survivors are precisely the 4 that ran before the container existed
(t6, t7, t10, t11). Two independent methods partitioning the suite identically. Death sites are
informative: t1 and t8 die at ~11 s on their "Success" assertion (**tail**), the rest at ~150 ms
inside `setupLdap` (head).

**M8** is the surgical complement: only the two login tests die, confirming the login assertions
are load-bearing independently of `setupLdap`.

**Restore:** spec restored **byte-identical, verified by `diff` AND md5**
(`413cf36983d4e20bb3c16aca1ce8d28f`); support module md5 `4e037cdd7b28093e1ad1697cfef7c0b8`.
Full suite re-run green after restore.

## Other porting notes

- Cypress aliases → `waitForResponse` predicates registered before the triggering action.
  `@updateSetting`/`@updateSettings` re-used from `support/sso-jwt.ts`; the group-mappings driver
  re-used from `support/sso-saml.ts` with method `"ldap"` — upstream parameterises it the same
  way. No shared module edited.
- **`getByDisplayValue` does not exist in Playwright.** Replaced with `expectDisplayValueCount`,
  which reads the live `.value` *property* and returns an `expect.poll` so it retries.
  Deliberately not `[value="…"]` — React keeps the attribute out of sync with the property. M5
  and M9 confirm it discriminates.
- **Strengthened, and saying so:** the provisioning absence check uses Playwright `getByText`
  (full `textContent`) where testing-library reads only direct child text nodes. For a *negative*
  assertion that is strictly stricter — the safe direction on an auth surface.
- Port-field typing uses click + `clear` + `pressSequentially` + blur rather than `fill`, because
  the field is `type="number"` behind a Formik `dirty` gate and #13313 depends on a trailing-space
  value ("389 ").
- **`signInWithCredentials` hazard — INAPPLICABLE, mechanism checked.** Both login tests type into
  the real login form; there is no `mb.api` `/api/session` POST anywhere in this spec, so
  cookie-jar precedence cannot arise. No throwaway request context needed.
- No fixture ids are guessed anywhere.

## Verification

- `bunx tsc --noEmit` clean for `sso-ldap`. Since tsc is provably silent on dead imports, all 18
  spec imports were hand-audited (every one used) and one unconsumed re-export was removed from
  the support module.
- Full run **14/14**; `--repeat-each=3` **42/42**, no flake.
- Jar verified **by identity**: `:4103` reports `version.hash = 751c2a9` (matches COMMIT-ID
  751c2a98); `ps` confirms `java -jar …/target/uberjar/metabase.jar`.
- Slot 3 left clean: 0 token features, `ldap-enabled=False`.
- All 6 scratch probe specs deleted; `test-results/` removed. Nothing committed. Port 4000 never
  touched. `PORTING.md` / `QUEUE.md` / `playwright.config.ts` not edited.
- **No Cypress cross-check** was performed; no claim is made about whether upstream also passes.

## Not applicable / not encountered (checked, not assumed)

- `blank.sql`, the 30-day snapshot fuse, the 1280×720 viewport: no test here is layout-dependent
  or uses a non-default snapshot.
- Toast trap: the provisioning test asserts a toast's *appearance*, not its dismissal, so the
  `toHaveCount(0)` rule does not apply. Now actually executed and stable across 3 repeats.
- `cy.intercept(…{statusCode:500})` empty-body trap: this spec stubs no responses.

## Summary (3 lines)

With the container up, all 14 tests execute and pass, stable at 42/42 over three repeats; the
`@external` tag is accurate and the `:sso-ldap` gate is real and split-by-argument (OSS login vs
EE provisioning/attribute-sync), with both arms executed and BE/FE agreeing.
Mutation testing paid for itself: M6 exposed a **vacuous absence assertion** passing pre-render
(now anchored, with the fix proven by that same mutation killing), while M3 flipped from survivor
to kill and promoted #16226 from "cannot discriminate" to genuinely load-bearing.
M10 was a bad mutation of mine built on a wrong hypothesis — both are recorded rather than buried;
slot 3 is verified clean at 0 token features.

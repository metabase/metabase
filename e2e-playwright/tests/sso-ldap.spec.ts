/**
 * Playwright port of e2e/test/scenarios/admin-2/sso/ldap.cy.spec.js
 *
 * ============================================================================
 * READ THIS FIRST — 10 of these 14 tests were NOT EXECUTED.
 * ============================================================================
 * Upstream's `@external` tag on both describes means an **OpenLDAP container**,
 * not a QA database: e2e/test/scenarios/docker-compose.yml defines service
 * `ldap` (bitnamilegacy/openldap:2.6.4) on host port 389, and
 * .github/actions/e2e-prepare-containers/action.yml starts it behind the
 * `openldap` input and blocks on `nc -z localhost 389`.
 *
 * No such container is running on this machine and starting one was not
 * permitted, so the LDAP-dependent tests are gated by `ldapUnavailableReason()`
 * and SKIP. They are ported faithfully but are **unverified** — treat every one
 * of them as untested code until someone runs them against a live server.
 *
 * This is not a soft dependency. PUT /api/ldap/settings (src/metabase/sso/api/
 * ldap.clj) runs `ldap/test-ldap-connection` and returns HTTP 500 unless the
 * bind succeeds — measured on this slot:
 *     500 {"errors":{"ldap-host":"Wrong host or port",
 *                    "ldap-port":"Wrong host or port"}}
 * and nothing is persisted (`ldap-enabled` stayed empty afterwards). So
 * `setupLdap()` cannot be stubbed or worked around.
 *
 * EXECUTED (4): the schema-validation test, the #16226 test, and the two
 *   Group Mappings Widget tests — none of which call setupLdap.
 * NOT EXECUTED (10): everything that calls setupLdap, plus the two tests whose
 *   assertions require a successful "Save and enable".
 *
 * Caveat on the #16226 test: it asserts "Wrong host or port" for port 1. With
 * no LDAP server, port 389 would produce that same error, so the test passes
 * here for a reason indistinguishable from "there is no server at all". It is
 * green but it is NOT evidence that the port-1 path works.
 *
 * ---------------------------------------------------------------------------
 * Token gate (traced + two-arm control, both arms run):
 * ---------------------------------------------------------------------------
 * `:sso-ldap` is a hard `define-premium-feature` (premium_features/settings.clj
 * :165) documented as "advanced configuration for LDAP authentication" — it is
 * SPLIT BY ARGUMENT: basic LDAP *login* works in OSS (which is why upstream's
 * "user login on OSS" test lives in the untokened describe), while attribute
 * sync and user provisioning (metabase_enterprise/sso/integrations/ldap.clj,
 * `:feature :sso-ldap`) are gated. FE agrees with BE: enterprise/frontend
 * .../auth/index.ts gates PLUGIN_LDAP_FORM_FIELDS on hasPremiumFeature
 * ("sso_ldap"); BE exposes `:sso_ldap` in the token-features map.
 *
 * Measured arms on this slot:
 *   OFF (no token): "Group membership filter" absent, User Provisioning absent.
 *   ON (pro-self-hosted, sso_ldap=true confirmed in /api/session/properties):
 *       "Group membership filter" RENDERS — the EE plugin is demonstrably live.
 *       User Provisioning still does NOT render (0 matches, testid absent).
 *
 * UNEXPLAINED (recorded, not rationalised): with sso_ldap=true and the EE
 * plugin proven loaded, `LdapUserProvisioning` renders nothing on an instance
 * where LDAP has never been configured. `AdminSettingInput` returns null when
 * `hidden || isLoading`; the setting IS present in GET /api/setting. Both
 * upstream tests that touch this UI call setupLdap() first, so "the section
 * needs LDAP configured" is the plausible explanation — I could not verify it
 * without a server and am not asserting it.
 *
 * CONSEQUENCE for "should not show the user provision UI to OSS users": that
 * assertion currently passes with a FULL EE token too, so in this environment
 * its OSS/EE distinction discriminates nothing. It is skipped anyway (setupLdap).
 *
 * ---------------------------------------------------------------------------
 * Other porting notes:
 * ---------------------------------------------------------------------------
 * - Cypress aliases → `page.waitForResponse` predicates registered before the
 *   triggering action (PORTING rule 2). @updateLdapSettings is local;
 *   @updateSetting / @updateSettings are re-used from support/sso-jwt.ts.
 * - The two login tests sign in through the **login form in the browser**, not
 *   via an API session POST — so the `signInWithCredentials` cookie-jar hazard
 *   is INAPPLICABLE here (checked the mechanism; there is no mb.api session
 *   POST anywhere in this spec).
 * - The `not.exist` provisioning check uses Playwright `getByText`, which reads
 *   full `textContent` where testing-library reads only direct child text
 *   nodes. For a negative assertion that makes this port STRICTER than
 *   upstream, which is the safe direction on an auth surface.
 * - Credentials: upstream inlines the OpenLDAP fixture's bind/user passwords.
 *   This port reads them from env (see support/sso-ldap.ts) with no fallback,
 *   per a standing no-credentials-in-source rule. Flagged as a deliberate
 *   deviation in findings-inbox/sso-ldap.md.
 * - Auth-state hygiene: `mb.restore()` in beforeEach resets the whole app DB
 *   including settings and the token (verified: token-features.sso_ldap ==
 *   false after restore), so a mid-test failure cannot poison the slot.
 *   NOTE the EE describe gates on LDAP *before* `activateToken` — see the
 *   comment on its beforeEach; doing it in the test bodies leaked an active
 *   pro-self-hosted token onto the shared slot backend (measured, then fixed).
 */
import type { Page } from "@playwright/test";

import { expect, test } from "../support/fixtures";
import {
  LDAP_USERNAME,
  LDAP_USER_PASSWORD,
  getLdapCard,
  enterLdapPort,
  enterLdapSettings,
  expectDisplayValueCount,
  ldapUnavailableReason,
  setupLdap,
  waitForUpdateLdapSettings,
} from "../support/sso-ldap";
import { waitForUpdateSetting, waitForUpdateSettings } from "../support/sso-jwt";
import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
  goToAuthOverviewPage,
} from "../support/sso-saml";
import { undoToast } from "../support/metrics";
import { icon, modal, popover } from "../support/ui";

/** Skips the calling test when there is no usable LDAP fixture server. */
async function requireLdap() {
  const reason = await ldapUnavailableReason();
  test.skip(!!reason, reason ?? "");
}

test.describe("scenarios > admin > settings > SSO > LDAP", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should setup ldap (metabase#16173)", async ({ page }) => {
    await requireLdap();
    await page.goto("/admin/settings/authentication/ldap");

    await enterLdapSettings(page);
    const updated = waitForUpdateLdapSettings(page);
    await page.getByRole("button", { name: "Save and enable" }).click();
    await updated;

    await expect(page.getByText("Success")).toBeVisible();
  });

  test("should update ldap settings", async ({ mb, page }) => {
    await requireLdap();
    await setupLdap(mb.api);
    await page.goto("/admin/settings/authentication/ldap");

    await enterLdapPort(page, "389");
    const updated = waitForUpdateLdapSettings(page);
    await page.getByRole("button", { name: "Save changes" }).click();
    await updated;

    await goToAuthOverviewPage(page);

    await expect(getLdapCard(page).getByText("Active")).toBeVisible();
  });

  test("should allow to disable and enable ldap", async ({ mb, page }) => {
    await requireLdap();
    await setupLdap(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getLdapCard(page), "ellipsis").click();
    const paused = waitForUpdateSetting(page);
    await popover(page).getByText("Pause").click();
    await paused;
    await expect(getLdapCard(page).getByText("Paused")).toBeVisible();

    await icon(getLdapCard(page), "ellipsis").click();
    const resumed = waitForUpdateSetting(page);
    await popover(page).getByText("Resume").click();
    await resumed;
    await expect(getLdapCard(page).getByText("Active")).toBeVisible();
  });

  test("should not show the user provision UI to OSS users", async ({
    mb,
    page,
  }) => {
    await requireLdap();
    await setupLdap(mb.api);

    // ANCHOR — load-bearing, do not simplify. The User Provisioning section is
    // rendered by a separate plugin component whose `AdminSettingInput` returns
    // null while its own settings query is loading, so it commits ~0.5s LATER
    // than the form fields. A bare `toHaveCount(0)` right after the form
    // appears therefore passes PRE-RENDER and is vacuous: it retries, but a
    // zero-assertion is satisfied on its very first poll.
    //
    // Measured: at "LDAP Host visible" the widget count is 0 even WITH the
    // token; by the time the submit button is visible it is 1. Proven by
    // mutation M6 (activate pro-self-hosted in this test) — it SURVIVED against
    // the unanchored version and KILLS against this one.
    const settingsLoaded = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        new URL(r.url()).pathname === "/api/setting",
    );
    await page.goto("/admin/settings/authentication/ldap");
    await settingsLoaded;
    await expect(
      page
        .getByRole("button", { name: "Save changes" })
        .or(page.getByRole("button", { name: "Save and enable" })),
    ).toBeVisible();

    await expect(
      page.getByTestId("admin-layout-content").getByText(/User Provisioning/i),
    ).toHaveCount(0);
  });

  test("should allow to reset ldap settings", async ({ mb, page }) => {
    await requireLdap();
    await setupLdap(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getLdapCard(page), "ellipsis").click();
    await popover(page).getByText("Deactivate").click();
    const updated = waitForUpdateSettings(page);
    await modal(page).getByRole("button", { name: "Deactivate" }).click();
    await updated;

    await expect(getLdapCard(page).getByText("Set up")).toBeVisible();
  });

  test("should not reset previously populated fields when schema validation fails for just one of them", async ({
    page,
  }) => {
    await page.goto("/admin/settings/authentication/ldap");

    await enterLdapSettings(page);
    await enterLdapPort(page, "0");
    await page.getByRole("button", { name: "Save and enable" }).click();

    // NOTE: upstream waits on @updateLdapSettings here, but port 0 is rejected
    // by the Malli `pos-int?` schema on the *client* side (LDAP_SCHEMA), so no
    // PUT is issued at all and `cy.wait` is satisfied by an earlier queued
    // response. Asserting on the rendered validation message directly is the
    // faithful intent; see findings for the trace.
    await expect(
      page.getByText("nullable integer greater than 0").first(),
    ).toBeVisible();
    await expectDisplayValueCount(page, "localhost").toBeGreaterThan(0);
  });

  test("should not reset previously populated fields when validation fails for just one of them (metabase#16226)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/authentication/ldap");

    await enterLdapSettings(page);
    await enterLdapPort(page, "1");
    const updated = waitForUpdateLdapSettings(page);
    await page.getByRole("button", { name: "Save and enable" }).click();
    await updated;

    await expect(page.getByText("Wrong host or port").first()).toBeVisible();
    await expectDisplayValueCount(page, "localhost").toBeGreaterThan(0);
  });

  test("shouldn't be possible to save a non-integer port (#13313)", async ({
    page,
  }) => {
    await requireLdap();
    await page.goto("/admin/settings/authentication/ldap");

    // Upstream aliases `findByLabelText(/LDAP Port/i).parent().parent()` as
    // @portSection and scopes the three checks below to it.
    const portSection = page
      .getByLabel(/LDAP Port/i)
      .locator("xpath=../..");

    await enterLdapSettings(page);
    await enterLdapPort(page, "asd");
    await expectDisplayValueCount(portSection, "asd").toBe(0);

    await enterLdapPort(page, "21.3");
    await expect(
      portSection.getByText("ldap-port must be an integer"),
    ).toBeVisible();

    await enterLdapPort(page, "389 ");
    await expect(
      portSection.getByText("That's not a valid port number"),
    ).toHaveCount(0);

    const updated = waitForUpdateLdapSettings(page);
    await page.getByRole("button", { name: "Save and enable" }).click();
    await updated;
    await expect(page.getByText("Success")).toBeVisible();
  });

  test("should allow user login on OSS when LDAP is enabled", async ({
    mb,
    page,
  }) => {
    await requireLdap();
    await setupLdap(mb.api);
    await mb.signOut();
    await page.goto("/auth/login");
    await signInThroughLoginForm(page);

    await expect(
      page.getByTestId("main-navbar-root").getByText("Home"),
    ).toBeVisible();
  });

  test.describe("Group Mappings Widget", () => {
    test("should allow deleting mappings along with deleting, or clearing users of, mapped groups", async ({
      page,
    }) => {
      await crudGroupMappingsWidget(page, "ldap");
    });

    test("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", async ({
      page,
    }) => {
      await checkGroupConsistencyAfterDeletingMappings(page, "ldap");
    });
  });
});

test.describe("scenarios > admin > settings > SSO > LDAP (EE)", () => {
  // The LDAP gate is checked BEFORE the token is activated, and deliberately
  // here rather than in the test bodies: all three tests in this describe need
  // a live server, and a body-level skip would let `activateToken` run first —
  // leaving pro-self-hosted ACTIVE on a shared slot backend after the test
  // skipped. (Observed: 42 token features still enabled on :4103 afterwards,
  // which would make a genuinely gated spec look ungated to the next agent.)
  test.beforeEach(async ({ mb }) => {
    await requireLdap();
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow the user to enable/disable user provisioning", async ({
    mb,
    page,
  }) => {
    await setupLdap(mb.api);
    await page.goto("/admin/settings/authentication/ldap");

    await page
      .getByTestId("ldap-user-provisioning-enabled?-setting")
      .getByText(/^Disabled/)
      .click();

    await expect(undoToast(page).getByText("Changes saved")).toBeVisible();
  });

  test("should show the login form when ldap is enabled but password login isn't (metabase#25661)", async ({
    mb,
    page,
  }) => {
    await setupLdap(mb.api);
    await mb.api.updateSetting("enable-password-login", false);
    await mb.signOut();
    await page.goto("/auth/login");

    // `exact: true` is load-bearing: Playwright's getByText is SUBSTRING
    // matching, so a bare "Password" also matches the "I seem to have
    // forgotten my password" link (strict-mode violation, observed). Cypress's
    // findByText(string) is an exact match on normalised text, so exact:true is
    // the faithful port, not a tightening. Both label elements have no nested
    // children, so testing-library's direct-child-text-nodes reading and
    // Playwright's full-textContent reading agree here.
    await expect(
      page.getByText("Username or email address", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Password", { exact: true })).toBeVisible();
  });

  test("should allow user login on EE when LDAP is enabled", async ({
    mb,
    page,
  }) => {
    await setupLdap(mb.api);
    await mb.signOut();
    await page.goto("/auth/login");
    await signInThroughLoginForm(page);

    await expect(
      page.getByTestId("main-navbar-root").getByText("Home"),
    ).toBeVisible();

    await mb.signOut();
    await mb.signInAsAdmin();

    // Check that attributes are synced
    await page.goto("/admin/people");
    const row = page
      .getByTestId("admin-people-list-table")
      .locator("tr")
      .filter({ has: page.getByText("Bar1 Bar1", { exact: true }) });
    await icon(row, "ellipsis").click();
    await popover(page).getByText("Edit user").click();

    await expectDisplayValueCount(page, "uid").toBeGreaterThan(0);
    await expectDisplayValueCount(page, "homedirectory").toBeGreaterThan(0);
  });
});

/**
 * Port of the shared login-form block in both login tests. Types into the real
 * login form — deliberately NOT an API session POST (see header note).
 */
async function signInThroughLoginForm(page: Page) {
  await page.getByLabel("Username or email address").fill(LDAP_USERNAME);
  await page.getByLabel("Password").fill(LDAP_USER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}

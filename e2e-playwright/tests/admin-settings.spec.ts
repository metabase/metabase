/**
 * Playwright port of e2e/test/scenarios/admin-2/settings.cy.spec.js
 *
 * INFRA TIER — email (maildev) + webhook-tester. NOT the QA-database tier:
 * nothing here restores a `*-writable` snapshot or touches an external SQL
 * container, so `PW_QA_DB_ENABLED` is irrelevant to this spec. The two
 * `@external` tags mean:
 *  - "should send a test email for a valid SMTP configuration" → maildev
 *    (SMTP :1025, web API :1080). **Pin maildev 2.x** — 3.x moved the REST
 *    API to /api/email, so `isMaildevRunning()` reports false and the test
 *    silently gate-skips while the run stays green.
 *  - the whole `notifications` describe → tarampampam/webhook-tester:1.1.0 on
 *    :9080 with the fixed session id, per the comment in the Cypress spec.
 *
 * Snowplow is CAPTURED, not stubbed, in the three describes whose assertions
 * ARE snowplow assertions (the cloud upsell and both SMTP-setup flows) —
 * `installSnowplowCapture` records the tracker's own POST at the browser
 * boundary (support/search-snowplow.ts). `expectNoBadSnowplowEvents` is the
 * documented structural stand-in: it cannot ask snowplow-micro for Iglu
 * schema-validation failures.
 *
 * Deviations, all deliberate and recorded:
 *
 * - **site-url is pinned by the harness** (`MB_SITE_URL` in
 *   support/worker-backend.ts, PORTING #39): on a slot backend `site-url`
 *   reports `is_env_setting: true`, so `SiteUrlWidget` renders `SetByEnvVar`
 *   and has no input at all. Three tests drive that widget. Rather than
 *   `test.fixme`-ing them, `unpinSiteUrl` (support/admin-settings.ts) removes
 *   *only the harness override* on the client: it flips `is_env_setting` back
 *   to false in `GET /api/setting` and echoes successful writes back through
 *   `GET /api/session/properties`. `PUT /api/setting/site-url` still goes to
 *   the real backend, so #4506's 500 / "Invalid site URL" comes from
 *   `metabase.system.settings/normalize-site-url` for real.
 * - `H.restore()` inside the https test body ("avoid leaving https site url")
 *   is dropped: with `MB_SITE_URL` set, the app-DB value never takes effect on
 *   this backend, and the shim's state dies with the page. Nothing leaks.
 * - `cy.wait("@x")` → `page.waitForResponse` registered before the trigger
 *   (rule 2). Never-awaited intercepts are dropped.
 * - Mantine `Select` dropdown rows are picked as `role="option"` with `exact`
 *   dropped (PORTING: `renderOption` injects icons/descriptions, so the
 *   accessible name is never just the label).
 * - `findByDisplayValue` is ported through the shared imperative scan
 *   (input/textarea/select, live value) — Playwright 1.61.1's types omit
 *   `getByDisplayValue`.
 * - Date/number values baked into the localization tests come from the sample
 *   database and can drift between the local jar and CI (PORTING's
 *   smartscalar-trend note). They are ported verbatim; a CI-only failure on
 *   one of those strings is sample-data drift, not port drift.
 */
import fs from "fs";
import path from "path";

import type { Page } from "@playwright/test";

import {
  expectDisplayValue,
  mockBillingTokenFeatures,
  setFirstWeekDayTo,
  unpinSiteUrl,
  waitForSetting,
} from "../support/admin-settings";
import { openOrdersTable } from "../support/ad-hoc-question";
import { visitNativeQuestionAdhoc } from "../support/charts-extras";
import { echartsContainer } from "../support/charts";
import {
  FieldSection,
  SAMPLE_DB_SCHEMA_ID,
  visitDataModel,
} from "../support/data-model";
import { selectDropdown } from "../support/dashboard";
import { createNativeQuestion, createQuestion } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { tableInteractive } from "../support/models";
import {
  WEBHOOK_TEST_HOST,
  WEBHOOK_TEST_SESSION_ID,
  WEBHOOK_TEST_URL,
  resetWebhookTester,
} from "../support/question-saved";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import { getInbox } from "../support/onboarding-extras";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";
import { modal, popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/** WEBMAIL_CONFIG.SMTP_PORT (e2e/support/cypress_data.js). */
const SMTP_PORT = "1025";

/** `${WEBHOOK_TEST_HOST}/#/${WEBHOOK_TEST_SESSION_ID}` (e2e-notification-helpers). */
const WEBHOOK_TEST_DASHBOARD = `${WEBHOOK_TEST_HOST}/#/${WEBHOOK_TEST_SESSION_ID}`;

test.describe("scenarios > admin > settings", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // H.resetSnowplow(): the capture starts empty and is installed before the
    // first navigation (the tracker is built during app bootstrap).
    capture = await installSnowplowCapture(page, mb.baseUrl);
  });

  test("should prompt admin to migrate to a hosted instance", async ({
    page,
  }) => {
    await page.goto("/admin/settings/cloud");

    const bigCard = page.getByTestId("upsell-big-card");
    await expect(bigCard.getByText(/Migrate to Metabase Cloud/)).toBeVisible();
    // findAllBy* + .click() = Cypress first-match (rule 3).
    await bigCard
      .getByRole("link", { name: "Learn more", exact: true })
      .first()
      .click();
    // link opens in new tab
    await expectUnstructuredSnowplowEvent(capture, {
      event: "upsell_viewed",
      promoted_feature: "cloud",
    });
    expectNoBadSnowplowEvents(capture);
  });

  test("should surface an error when validation for any field fails (metabase#4506)", async ({
    page,
    mb,
  }) => {
    const DOMAIN_AND_PORT = mb.baseUrl.replace("http://", "");
    await unpinSiteUrl(page, mb.baseUrl);

    await page.goto("/admin/settings/general");

    // Needed to strip down the protocol from URL to accomodate our UI
    // (<select> PORT | <input> DOMAIN_AND_PORT)
    // Scoped to the site-url widget for the same staleness reason as the
    // currency select below — same element upstream's page-wide query hit.
    const siteUrlInput = await findByDisplayValue(
      page.getByTestId("site-url-setting"),
      DOMAIN_AND_PORT,
    );
    const siteUrlSaved = waitForSetting(page, "PUT", "/api/setting/site-url");
    await siteUrlInput.click();
    await siteUrlInput.pressSequentially("foo", { delay: 100 });
    await siteUrlInput.blur();

    const response = await siteUrlSaved;
    expect(response.status()).toBe(500);
    // Switching to regex match for assertions - the test was flaky because of
    // the "typing" issue, i.e. it sometimes doesn't type the whole string
    // "foo", but only "oo". We only care that the `cause` starts with
    // "Invalid site URL".
    const body = (await response.json()) as { cause?: string };
    expect(body.cause).toMatch(/^Invalid site URL/);

    // NOTE: This test is not concerned with HOW we style the error message -
    // only that there is one.
    await expect(undoToast(page).first()).toContainText(/^Invalid site URL/);
  });

  test("should save a setting", async ({ page }) => {
    await page.goto("/admin/settings/general");

    // Upstream reached the input through
    // `cy.contains(/Email Address for Help Requests/i).parent().parent().find("input")`.
    // AdminSettingInput renders `data-testid="<name>-setting"` around the
    // header + control, which is the same single input, scoped.
    const emailInput = () =>
      page.getByTestId("admin-email-setting").locator("input");

    const saved = waitForSetting(page, "PUT", "/api/setting/admin-email");
    await emailInput().click();
    await emailInput().fill("");
    await emailInput().pressSequentially("abc", { delay: 50 });
    await emailInput().fill("");
    await emailInput().click();
    await emailInput().pressSequentially("other.email@metabase.test");
    await emailInput().blur();
    await saved;

    await page.goto("/admin/settings/general");
    // after we refreshed, the field should still be "other.email"
    await expect(emailInput()).toHaveValue("other.email@metabase.test");
  });

  test("should check for working https before enabling a redirect", async ({
    page,
    mb,
  }) => {
    await unpinSiteUrl(page, mb.baseUrl);
    await page.goto("/admin/settings/general");

    let healthChecks = 0;
    await page.route(
      (url) => url.pathname === "/api/health",
      (route) => {
        healthChecks += 1;
        return route.fulfill({ status: 200, body: "ok" });
      },
    );

    const content = page.getByTestId("admin-layout-content");
    await expect(content.getByText(/Site Url/i).first()).toBeVisible();
    await expect(content.getByText(/Redirect to HTTPS/i)).toHaveCount(0);

    // switch site url to use https
    await page
      .getByTestId("site-url-setting")
      .getByRole("textbox", { name: "input-prefix" })
      .click();
    await popover(page).getByRole("option", { name: "https://" }).click();

    await expect.poll(() => healthChecks).toBeGreaterThan(0);
    await expect(
      content
        .getByTestId("redirect-all-requests-to-https-setting")
        .getByText("Disabled", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText("Redirect to HTTPS", { exact: true }),
    ).toBeVisible();
  });

  test("should display an error if the https redirect check fails", async ({
    page,
    mb,
  }) => {
    await unpinSiteUrl(page, mb.baseUrl);
    await page.goto("/admin/settings/general");

    let healthChecks = 0;
    await page.route(
      (url) => url.pathname === "/api/health",
      (route) => {
        healthChecks += 1;
        return route.abort("failed");
      },
    );

    // switch site url to use https
    await page
      .getByTestId("site-url-setting")
      .getByRole("textbox", { name: "input-prefix" })
      .click();
    await popover(page).getByRole("option", { name: "https://" }).click();

    await expect.poll(() => healthChecks).toBeGreaterThan(0);
    await expect(
      page.getByText("It looks like HTTPS is not properly configured"),
    ).toBeVisible();
  });

  test("should correctly apply the globalized date formats (metabase#11394) and update the formatting", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    await page.goto("/admin/settings/localization");

    const dateStyleSetting = page.getByTestId("date_style-formatting-setting");
    let saved = waitForSetting(page, "PUT", "/api/setting/custom-formatting");
    await (
      await findByDisplayValue(dateStyleSetting, "January 31, 2018")
    ).click();
    await popover(page).getByRole("option", { name: "2018/1/31" }).click();
    await saved;

    await expectDisplayValue(dateStyleSetting, "2018/1/31");

    const formatting = page.getByTestId("custom-formatting-setting");
    saved = waitForSetting(page, "PUT", "/api/setting/custom-formatting");
    await formatting.getByText("17:24 (24-hour clock)", { exact: true }).click();
    await saved;
    await expect(page.locator('input[value="HH:mm"]')).toBeChecked();

    await openOrdersTable(page, { limit: 2 });

    await expect(page.getByText("Created At", { exact: true })).toBeVisible();
    const cells = page.getByTestId("cell-data");
    // `should("contain", x)` on a multi-element subject is an ANY-of-set
    // assertion (rule 3).
    await expect(cells.filter({ hasText: "Created At" }).first()).toBeVisible();
    await expect(
      cells.filter({ hasText: "2028/2/11, 21:40" }).first(),
    ).toBeVisible();

    // Go back to the settings and reset the time formatting
    await page.goto("/admin/settings/localization");

    saved = waitForSetting(page, "PUT", "/api/setting/custom-formatting");
    await page
      .getByTestId("custom-formatting-setting")
      .getByText("5:24 PM (12-hour clock)", { exact: true })
      .click();
    await saved;
    await expect(page.locator('input[value="h:mm A"]')).toBeChecked();

    await openOrdersTable(page, { limit: 2 });

    await expect(page.getByText("Created At", { exact: true })).toBeVisible();
    await expect(
      page
        .getByTestId("cell-data")
        .filter({ hasText: "2028/2/11, 9:40 PM" })
        .first(),
    ).toBeVisible();
  });

  test("should show where to display the unit of currency (metabase#table-metadata-missing-38021 and update the formatting", async ({
    page,
    mb,
  }) => {
    // Set the semantic type of total to currency
    await mb.api.put(`/api/field/${ORDERS.TOTAL}`, {
      semantic_type: "type/Currency",
    });

    await visitDataModel(page, "admin", {
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: ORDERS_ID,
      fieldId: ORDERS.TOTAL,
    });

    const fieldSection = FieldSection.get(page);
    // Assert that this option now exists
    const currencyLabel = fieldSection.getByText(
      "Where to display the unit of currency",
      { exact: true },
    );
    await currencyLabel.scrollIntoViewIfNeeded();
    await expect(currencyLabel).toBeVisible();
    await fieldSection
      .getByText("In every table cell", { exact: true })
      .click();

    // Open the orders table
    await openOrdersTable(page, { limit: 2 });

    // Items in the total column should have a leading dollar sign
    await expect(
      page.getByTestId("table-body").getByText("$39.72", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTestId("table-body").getByText("$117.03", { exact: true }),
    ).toBeVisible();
  });

  test("should search for and select a new timezone", async ({ page }) => {
    await page.goto("/admin/settings/localization");
    const timezoneSelect = page.getByRole("textbox", { name: /timezone/i });
    const saved = waitForSetting(page, "PUT", "/api/setting/report-timezone");
    await timezoneSelect.click();
    await timezoneSelect.fill("");
    await timezoneSelect.pressSequentially("Centr");
    await selectDropdown(page).getByText("US/Central", { exact: true }).click();
    await saved;
    await expect(timezoneSelect).toHaveValue("US/Central");
  });

  test("'General' admin settings should handle setup via `MB_SITE_URL` environment variable (metabase#14900)", async ({
    page,
    mb,
  }) => {
    // 1. Get the array of ALL available settings
    const settings = (await (await mb.api.get("/api/setting")).json()) as {
      key: string;
    }[];
    // 2. Create a stubbed version of that array by passing modified "site-url"
    //    settings
    const stubbedBody = settings.map((setting) =>
      setting.key === "site-url"
        ? { ...setting, is_env_setting: true, value: null }
        : setting,
    );
    // 3. Stub the whole response.
    //
    // NOTE on strength: this stub is redundant on a slot backend, which boots
    // with MB_SITE_URL and therefore reports `site-url` as env-set for real.
    // And the test only asserts that the page renders (no error boundary,
    // Site name / Site URL labels present) — MEASURED: flipping the stub to
    // `is_env_setting: false` leaves it green, i.e. upstream's assertions do
    // not discriminate the condition in the title. Kept 1:1 rather than
    // invented into something stronger; recorded in findings-inbox.
    let appSettingsFetched = 0;
    await page.route(
      (url) => url.pathname === "/api/setting",
      (route) => {
        if (route.request().method() !== "GET") {
          return route.fallback();
        }
        appSettingsFetched += 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(stubbedBody),
        });
      },
    );

    await page.goto("/admin/settings/general");

    await expect.poll(() => appSettingsFetched).toBeGreaterThan(0);
    // Anchor first (PORTING #73): "We're a little lost" is the error boundary,
    // and its absence proves nothing until the page has rendered.
    await expect(page.getByText(/Site name/i).first()).toBeVisible();
    await expect(page.getByText("We're a little lost...")).toHaveCount(0);
    await expect(page.getByText(/Site URL/i).first()).toBeVisible();
  });

  test.describe(" > slack settings", () => {
    test("should present the form and display errors", async ({ page }) => {
      await page.goto("/admin/settings/slack");

      await expect(
        page
          .getByRole("main")
          .getByText("Create a Slack app and connect to it.", { exact: true }),
      ).toBeVisible();

      await page
        .getByLabel(/Slack Bot User OAuth Token/i)
        .fill("xoxb");
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await expect(
        page.getByRole("main").getByText(/invalid token/i),
      ).toBeVisible();
    });
  });
});

test.describe("scenarios > admin > settings (OSS)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  // @OSS upstream. AdminNavbar renders the store link on `!isPaidPlan`, which
  // is a TOKEN condition, not a build one — so this runs on the EE jar with no
  // token activated. (The "EE jar ≠ OSS build" caveat only bites assertions
  // gated on PLUGIN_IS_EE_BUILD; this one isn't.)
  test("should show the store link when running Metabase OSS", async ({
    page,
  }) => {
    await page.goto("/admin/settings/general");

    await expect(
      page.getByLabel("Navigation bar").getByLabel("store icon"),
    ).toBeVisible();
  });
});

test.describe("scenarios > admin > settings (EE)", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should hide the store link when running Metabase EE", async ({
    page,
  }) => {
    await page.goto("/admin/settings/license");

    // Cypress's `findByTestId(...).findByLabelText(...)` throws if the testid
    // is missing, so the chain carried an implicit existence assertion that a
    // bare toHaveCount(0) drops (PORTING). Restore it — otherwise the absence
    // check passes on a page that never painted.
    const content = page.getByTestId("admin-layout-content");
    await expect(content).toBeVisible();
    await expect(content.getByLabel("store icon")).toHaveCount(0);

    // The line above is upstream's assertion and it is VACUOUS: `StoreLink`
    // renders in `AdminNavbar`, never inside `admin-layout-content`.
    // MEASURED on /admin/settings/license (jar 751c2a98) —
    //   no token:            content=0 navbar=1 pageWide=2
    //   pro-self-hosted:     content=0 navbar=0 pageWide=1
    // (the residual page-wide icon is the License item in the settings
    // sidebar). So the upstream check cannot fail either way. The behaviour it
    // MEANT to assert is real, and its OSS twin above already scopes to the
    // navigation bar — so assert it there too. Mutation-verified: dropping the
    // token now kills this test (it did not before).
    await expect(
      page.getByLabel("Navigation bar").getByLabel("store icon"),
    ).toHaveCount(0);
  });
});

test.describe("Cloud settings section", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be visible when running Metabase Cloud", async ({
    page,
    mb,
  }) => {
    // Setting to none will give us an instance where token-features.hosting is
    // set to true, allowing us to pretend that we are a hosted instance.
    await mb.api.activateToken("pro-cloud");

    await page.goto("/admin/settings");
    await page
      .getByTestId("admin-layout-sidebar")
      .getByText(/Cloud/i)
      .first()
      .click();
    await expect(
      page
        .getByTestId("admin-layout-content")
        .getByText("Go to the Metabase Store", { exact: true }),
    ).toHaveAttribute("href", "https://test-store.metabase.com/");
  });

  test("should prompt us to migrate to cloud if we are not hosted", async ({
    page,
    mb,
  }) => {
    await mb.api.activateToken("pro-self-hosted");
    await page.goto("/admin/settings/cloud");
    const cloudLink = page
      .getByTestId("settings-sidebar-link")
      // Cypress `filter(":contains(Cloud)")` — case-sensitive substring.
      .filter({ hasText: /Cloud/ });
    await expect(cloudLink.locator(".Icon-gem")).toHaveCount(1);
    await cloudLink.click();

    await expect(
      page.getByRole("heading", { name: "Migrate to Metabase Cloud" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Try for free", exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > admin > settings > email settings", () => {
  test.describe("self-hosted instance", () => {
    let capture: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      capture = await installSnowplowCapture(page, mb.baseUrl);
      await mb.api.updateSetting("anon-tracking-enabled", true);
    });

    test("should be able to save and clear email settings", async ({
      page,
    }) => {
      test.skip(
        !(await isMaildevRunning()),
        "maildev container not reachable — PUT /api/email live-validates the SMTP connection",
      );

      await page.goto("/admin/settings/email");
      const selfHostedCard = page.getByTestId(
        "self-hosted-smtp-connection-card",
      );
      // Anchor (PORTING #73): the cloud card's absence means nothing until the
      // email page has actually rendered its cards.
      await expect(selfHostedCard).toBeVisible();
      await expect(
        page.getByTestId("cloud-smtp-connection-card"),
      ).toHaveCount(0);
      await selfHostedCard
        .getByRole("button", { name: "Configure", exact: true })
        .click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "custom_smtp_setup_clicked",
        event_detail: "self-hosted",
      });

      const dialog = modal(page);
      const smtpSaved = waitForSetting(page, "PUT", "/api/email");
      // SMTP connection setup
      await dialog.getByLabel(/SMTP Host/i).fill("localhost");
      await dialog.getByLabel(/SMTP Host/i).blur();
      await dialog.getByLabel(/SMTP Port/i).fill(SMTP_PORT);
      await dialog.getByLabel(/SMTP Port/i).blur();
      await dialog.getByLabel(/SMTP Username/i).fill("admin");
      await dialog.getByLabel(/SMTP Username/i).blur();
      await dialog.getByLabel(/SMTP Password/i).fill("admin");
      await dialog.getByLabel(/SMTP Password/i).blur();
      await dialog
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await smtpSaved;

      await expectUnstructuredSnowplowEvent(capture, {
        event: "custom_smtp_setup_success",
        event_detail: "self-hosted",
      });

      // should show as active now
      await expect(
        selfHostedCard.getByText("Active", { exact: true }),
      ).toBeVisible();

      // button should be different
      await expect(
        selfHostedCard.getByRole("button", {
          name: "Edit configuration",
          exact: true,
        }),
      ).toBeVisible();

      // Non SMTP-settings should save automatically
      await page.getByLabel("From Address").fill("mailer@metabase.test");
      await page.getByLabel("From Address").blur();
      await page.getByLabel("From Name").fill("Sender Name");
      await page.getByLabel("From Name").blur();
      await page.getByLabel("Reply-To Address").fill("reply-to@metabase.test");
      await page.getByLabel("Reply-To Address").blur();

      // Refresh page to confirm changes persist
      await page.reload();

      // validate additional settings
      await expectDisplayValue(page, "mailer@metabase.test");
      await expectDisplayValue(page, "Sender Name");
      await expectDisplayValue(page, "reply-to@metabase.test");

      // validate SMTP connection settings
      await selfHostedCard
        .getByText("Edit configuration", { exact: true })
        .click();
      await expectDisplayValue(page, "localhost");
      await expectDisplayValue(page, SMTP_PORT);
      await expectDisplayValue(page, "admin");

      // should not offer to save email changes when there aren't any
      // (metabase#14749)
      await expect(
        modal(page).getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();

      // should be able to clear email settings
      await modal(page)
        .getByRole("button", { name: "Clear", exact: true })
        .click();

      await page.reload();

      await selfHostedCard.getByText("Configure", { exact: true }).click();

      const clearedDialog = modal(page);
      await expect(clearedDialog.getByLabel("SMTP Host")).toHaveValue("");
      await expect(clearedDialog.getByLabel("SMTP Port")).toHaveValue("");
      await expect(clearedDialog.getByLabel("SMTP Username")).toHaveValue("");
      await expect(clearedDialog.getByLabel("SMTP Password")).toHaveValue("");

      expectNoBadSnowplowEvents(capture);
    });

    test("should show an error if test email fails", async ({ page, mb }) => {
      // Reuse Email setup without relying on the previous test
      await mb.api.put("/api/setting", {
        "email-from-address": "admin@metabase.test",
        "email-from-name": "Metabase Admin",
        "email-reply-to": ["reply-to@metabase.test"],
        "email-smtp-host": "localhost",
        "email-smtp-password": null,
        "email-smtp-port": "1234",
        "email-smtp-security": "none",
        "email-smtp-username": null,
      });
      await page.goto("/admin/settings/email");

      const content = page.getByTestId("admin-layout-content");
      await content
        .getByRole("button", { name: "Send test email", exact: true })
        .click();
      await expect(
        content.getByText(
          "Couldn't connect to host, port: localhost, 1234; timeout -1",
          { exact: true },
        ),
      ).toBeVisible();
    });

    test("should send a test email for a valid SMTP configuration", async ({
      page,
      mb,
    }) => {
      test.skip(
        !(await isMaildevRunning()),
        "@external: needs the maildev container (SMTP :1025, web API :1080)",
      );

      await setupSMTP(mb.api);
      await page.goto("/admin/settings/email");
      await page
        .getByRole("button", { name: "Send test email", exact: true })
        .click();
      await expect(
        undoToast(page).getByText("Email sent!", { exact: true }),
      ).toBeVisible();

      // Upstream reads body[0].text. H.getInbox()-style "first email in the
      // box" is a coin flip on a shared container, so wait for OUR subject.
      const email = await waitForTestEmail();
      expect(email.text ?? "").toContain("Your Metabase emails are working");
    });
  });

  test.describe("starter instance", () => {
    test.beforeEach(async ({ page, mb }) => {
      await page.route(
        (url) => url.pathname === "/api/session/properties",
        async (route) => {
          const request = route.request();
          const response = await fetch(request.url(), {
            headers: await request.allHeaders(),
          });
          const body = (await response.json()) as Record<string, unknown>;
          // in an actual cloud starter instance this gets configured via env vars
          body["email-configured?"] = true;
          await route.fulfill({
            status: response.status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        },
      );

      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("starter");
    });

    test("should not allow custom SMTP configuration", async ({ page }) => {
      await page.goto("/admin/settings/email");

      const selfHostedCard = page.getByTestId(
        "self-hosted-smtp-connection-card",
      );
      const cloudCard = page.getByTestId("cloud-smtp-connection-card");

      // Upstream order, kept verbatim; both also hold after the page paints
      // and are re-asserted below (upstream's bare position is inside the
      // mount-lag window — PORTING #73).
      await expect(selfHostedCard).toHaveCount(0);
      await expect(cloudCard).toHaveCount(0);

      const content = page.getByTestId("admin-layout-content");
      await expect(
        content.getByText("Whitelabel email notifications", { exact: true }),
      ).toBeVisible();
      await expect(content.getByLabel("From Address")).toBeDisabled();
      await expect(
        content.getByText(
          "Please set up a custom SMTP server to change this (Pro only)",
          { exact: true },
        ),
      ).toBeVisible();

      // Anchored re-checks (strictly stronger than upstream): now that the
      // page has demonstrably painted, both SMTP cards really are absent.
      await expect(selfHostedCard).toHaveCount(0);
      await expect(cloudCard).toHaveCount(0);
    });

    /**
     * The fifth assertion of upstream's "should not allow custom SMTP
     * configuration" — `cy.button("Send test email").should("not.exist")` —
     * split out rather than dropped, because it does NOT hold.
     *
     * MEASURED (jar 751c2a98): once the page paints the button is present,
     * "24 x locator resolved to 1 element". `SendTestEmailWidget` renders on
     * `isHosted || isEmailConfigured` with NO token gate, and this test's own
     * `email-configured? = true` intercept (upstream's, ported verbatim)
     * satisfies exactly that condition; `EmailSettingsPage` gates the whole
     * block on the same flag.
     *
     * Upstream is green only because the check samples before
     * `LoadingAndErrorWrapper` resolves — and it is a RACE, not a stable
     * vacuity: kept in upstream's position it passed in a normal run and
     * FAILED in the gate-off control run, where the preceding maildev tests
     * skip and the page reaches its painted state sooner. Shipping it in that
     * form would have been a flake generator.
     *
     * Two readings, not distinguished here: either the starter tier really
     * should hide the button (a product regression that upstream's racy
     * assertion cannot catch), or the assertion has been wrong since the
     * widget's render condition changed. Needs a product decision.
     */
    test.fixme(
      "should not offer 'Send test email' on a starter instance",
      async ({ page }) => {
        await page.goto("/admin/settings/email");
        await expect(
          page.getByTestId("admin-layout-content").getByLabel("From Address"),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: "Send test email", exact: true }),
        ).toHaveCount(0);
      },
    );
  });

  test.describe("Pro-cloud instance", () => {
    let capture: SnowplowCapture;

    test.beforeEach(async ({ page, mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("pro-cloud");
      // A real pro-cloud instance configures email via env vars; set the SMTP
      // host so email-configured? is true (avoids a session/properties
      // intercept that flakes on reload).
      await mb.api.updateSetting("email-smtp-host", "smtp.example.test");
      capture = await installSnowplowCapture(page, mb.baseUrl);
      await mb.api.updateSetting("anon-tracking-enabled", true);
    });

    test("should be able to save and clear email settings", async ({
      page,
    }) => {
      // This test configures localhost:465 with SSL, which `PUT
      // /api/ee/email/override` LIVE-VALIDATES (channel/email.clj
      // check-and-update-settings → test-smtp-connection). It therefore needs
      // the `maildev-ssl` container from e2e/test/scenarios/docker-compose.yml
      // (SMTP :465, web :1081) plus its root CA in the JVM keystore — even
      // though upstream carries no `@external` tag on it. MEASURED without
      // that container: the PUT answers 400
      // {"errors":{"email-smtp-host-override":"Wrong host or port",...}} and
      // the `custom_smtp_setup_success` event never fires.
      test.skip(
        !(await isMaildevSslRunning()),
        "needs the maildev-ssl container (SMTP :465, web :1081) — see docker-compose.yml",
      );

      await page.goto("/admin/settings/email");
      const cloudCard = page.getByTestId("cloud-smtp-connection-card");
      // Anchor (PORTING #73) — see the self-hosted describe.
      await expect(cloudCard).toBeVisible();
      await expect(
        page.getByTestId("self-hosted-smtp-connection-card"),
      ).toHaveCount(0);
      await cloudCard
        .getByRole("button", {
          name: "Set up a custom SMTP server",
          exact: true,
        })
        .click();

      await expectUnstructuredSnowplowEvent(capture, {
        event: "custom_smtp_setup_clicked",
        event_detail: "cloud",
      });

      const dialog = modal(page);
      const smtpSaved = waitForSetting(page, "PUT", "/api/ee/email/override");
      await dialog.getByLabel(/SMTP Host/i).fill("localhost");
      await dialog.getByLabel(/SMTP Host/i).blur();
      await dialog.getByText(/465/i).click();
      await dialog.getByText(/SSL/i).click();
      // `have.attr` on a BOOLEAN attribute asserts PRESENCE (PORTING) — jQuery
      // returns the attribute name, Playwright returns "".
      await expect(dialog.locator('input[value="465"]')).toBeChecked();
      await expect(dialog.locator('input[value="ssl"]')).toBeChecked();
      await dialog.getByLabel(/SMTP Username/i).fill("admin");
      await dialog.getByLabel(/SMTP Username/i).blur();
      await dialog.getByLabel(/SMTP Password/i).fill("admin");
      await dialog.getByLabel(/SMTP Password/i).blur();
      await dialog
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await smtpSaved;

      await expectUnstructuredSnowplowEvent(capture, {
        event: "custom_smtp_setup_success",
        event_detail: "cloud",
      });

      // Button text should change
      await expect(
        cloudCard.getByRole("button", { name: "Edit settings", exact: true }),
      ).toBeVisible();
      // Custom server should be auto-enabled
      await expect(cloudCard.getByLabel("Custom SMTP Server")).toBeChecked();

      await page.getByLabel("From Address").fill("mailer@metabase.test");
      await page.getByLabel("From Address").blur();
      await page.getByLabel("From Name").fill("Sender Name");
      await page.getByLabel("From Name").blur();
      await page.getByLabel("Reply-To Address").fill("reply-to@metabase.test");
      await page.getByLabel("Reply-To Address").blur();

      // Refresh page to confirm changes persist
      await page.reload();

      // validate additional settings
      await expectDisplayValue(page, "mailer@metabase.test");
      await expectDisplayValue(page, "Sender Name");
      await expectDisplayValue(page, "reply-to@metabase.test");

      // validate SMTP connection settings
      await cloudCard.getByText("Edit settings", { exact: true }).click();
      const editDialog = modal(page);
      await expectDisplayValue(editDialog, "localhost");
      await expectDisplayValue(editDialog, "admin");
      await expect(
        editDialog.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeDisabled();

      const smtpCleared = waitForSetting(
        page,
        "DELETE",
        "/api/ee/email/override",
      );
      await editDialog
        .getByRole("button", { name: "Clear", exact: true })
        .click();
      await smtpCleared;
      await expect(editDialog.getByLabel("SMTP Host")).toHaveValue("");
      await expect(editDialog.locator('input[value="465"]')).toBeChecked();
      await expect(editDialog.locator('input[value="ssl"]')).toBeChecked();
      await expect(editDialog.getByLabel("SMTP Username")).toHaveValue("");
      await expect(editDialog.getByLabel("SMTP Password")).toHaveValue("");
      await editDialog.getByRole("button", { name: "Close" }).click();

      // Button text should revert back
      await expect(
        cloudCard.getByText("Set up a custom SMTP server", { exact: true }),
      ).toBeVisible();

      expectNoBadSnowplowEvents(capture);
    });
  });
});

test.describe("scenarios > admin > license and billing", () => {
  const HOSTING_FEATURE_KEY = "hosting";
  const STORE_MANAGED_FEATURE_KEY = "metabase-store-managed";
  const NO_UPSELL_FEATURE_HEY = "no-upsell";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("store info", () => {
    test("should show the user a link to the store for an unlincensed enterprise instance", async ({
      page,
    }) => {
      await page.goto("/admin/settings/license");
      await expect(
        page
          .getByTestId("license-and-billing-content")
          .getByText("Go to the Metabase Store", { exact: true }),
      ).toHaveJSProperty("tagName", "A");
    });

    test("should not show license input for cloud-hosted instances", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("pro-self-hosted");
      await mockBillingTokenFeatures(page, [
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
        HOSTING_FEATURE_KEY,
      ]);
      await page.goto("/admin/settings/license");
      // Anchor: upstream's bare `should("not.exist")` is satisfied by "nothing
      // has rendered yet" (PORTING #73). Wait for the page's own content first.
      await expect(
        page.getByTestId("license-and-billing-content"),
      ).toBeVisible();
      await expect(page.getByTestId("license-input")).toHaveCount(0);
    });

    test("should render an error if something fails when fetching billing info", async ({
      page,
      mb,
    }) => {
      await mb.api.activateToken("pro-self-hosted");
      await mockBillingTokenFeatures(page, [
        STORE_MANAGED_FEATURE_KEY,
        NO_UPSELL_FEATURE_HEY,
      ]);
      // force an error
      await page.route(
        (url) => url.pathname === "/api/ee/billing",
        (route) => route.fulfill({ status: 500, body: "" }),
      );
      await page.goto("/admin/settings/license");
      await expect(
        page
          .getByTestId("license-and-billing-content")
          .getByText(/An error occurred/),
      ).toBeVisible();
    });
  });
});

test.describe("scenarios > admin > localization", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await setFirstWeekDayTo(mb.api, "monday");
  });

  test("should correctly apply start of the week to a bar chart (metabase#13516)", async ({
    page,
    mb,
  }) => {
    // programatically create and save a question based on Orders table
    // filter: created before June 1st, 2025
    // summarize: Count by CreatedAt: Week
    const { id } = await createQuestion(mb.api, {
      name: "Orders created before June 1st 2025",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        filter: ["<", ["field", ORDERS.CREATED_AT, null], "2025-06-01"],
      },
      display: "bar",
    });
    await visitQuestion(page, id);

    // it's hard and tricky to invoke hover in Cypress, especially in our
    // graphs; that's why we assert on the x-axis instead. April 28 is Monday
    // in year 2025. Expect this to break when we shift years in the Sample
    // Database.
    await expect(
      echartsContainer(page)
        .locator("text")
        .filter({ hasText: "April 28, 2025" })
        .first(),
    ).toBeVisible();
  });

  test("should display days on X-axis correctly when grouped by 'Day of the Week' (metabase#13604)", async ({
    page,
    mb,
  }) => {
    await createQuestion(mb.api, {
      name: "13604",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "day-of-week" }],
        ],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, null],
          "2026-03-02", // Monday
          "2026-03-03", // Tuesday
        ],
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.x_axis.scale": "ordinal",
      },
    });

    await page.goto("/collection/root");
    await page.getByText("13604", { exact: true }).click();

    // Reported failing on v0.37.0.2 and labeled as `.Regression`
    const axisText = echartsContainer(page).locator("text");
    await expect(axisText.filter({ hasText: /monday/i }).first()).toBeVisible();
    await expect(axisText.filter({ hasText: /tuesday/i }).first()).toBeVisible();
    await expect(axisText.filter({ hasText: /sunday/i })).toHaveCount(0);
  });

  // HANDLE WITH CARE!
  // This test is extremely tricky and fragile because it needs to test for the
  // "past X weeks" to check if week starts on Sunday or Monday.
  test("should respect start of the week in SQL questions with filters (metabase#14294)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "14294",
      native: {
        query:
          "select ID, CREATED_AT, dayname(CREATED_AT) as CREATED_AT_DAY\nfrom ORDERS \n[[where {{date_range}}]]\norder by CREATED_AT",
        "template-tags": {
          date_range: {
            id: "93961154-c3d5-7c93-7b59-f4e494fda499",
            name: "date_range",
            "display-name": "Date range",
            type: "dimension",
            dimension: ["field", ORDERS.CREATED_AT, null],
            "widget-type": "date/all-options",
            default: "past220weeks",
            required: true,
          },
        },
      },
    });
    await visitQuestion(page, id);

    // The third cell in the first row (CREATED_AT_DAY)
    await expect(
      tableInteractive(page).getByTestId("cell-data").nth(2),
    ).not.toContainText("Sunday");
  });

  test("should use currency settings for number columns with style set to currency (metabase#10787)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/localization");

    await expect(page.getByText("Unit of currency").first()).toBeVisible();
    // Scoped to the currency widget rather than upstream's page-wide
    // `findByDisplayValue`: the localization page re-renders as settings land,
    // and a page-wide scan resolves an INDEX (`input,textarea,select` nth) that
    // goes stale — measured once in 3x repeat-each as a 30s click timeout on
    // `<input type="hidden" value="MMMM D, YYYY">`, i.e. a different widget's
    // hidden Mantine value input. Same single element Cypress resolved.
    await (
      await findByDisplayValue(
        page.getByTestId("currency-formatting-setting"),
        "US Dollar",
      )
    ).click();
    await page.getByRole("option", { name: "Euro" }).first().click();
    await expect(
      undoToast(page).getByText("Changes saved", { exact: true }),
    ).toBeVisible();

    await visitNativeQuestionAdhoc(page, {
      display: "scalar",
      dataset_query: {
        type: "native",
        native: {
          query: "SELECT 10 as A",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        column_settings: {
          '["name","A"]': {
            number_style: "currency",
          },
        },
      },
    });

    await expect(page.getByText("€10.00").first()).toBeVisible();
  });

  test("should use fix up clj unit testsdate and time styling settings in the date filter widget (metabase#9151, metabase#12472)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/localization");

    const formatting = page.getByTestId("custom-formatting-setting");
    let updated = waitForSetting(page, "PUT", "/api/setting/custom-formatting");
    // update the date style setting to YYYY/MM/DD
    await (await findByDisplayValue(formatting, "January 31, 2018")).click();
    await popover(page).getByRole("option", { name: "2018/1/31" }).click();
    await updated;

    await expectDisplayValue(
      page.getByTestId("date_style-formatting-setting"),
      "2018/1/31",
    );

    updated = waitForSetting(page, "PUT", "/api/setting/custom-formatting");
    // update the time style setting to 24 hour
    await formatting.getByText("17:24 (24-hour clock)", { exact: true }).click();
    await updated;
    await expect(formatting.locator('input[value="HH:mm"]')).toBeChecked();

    await visitQuestion(page, ORDERS_QUESTION_ID);

    // create a date filter and set it to the 'On' view to see a specific date
    await page
      .getByTestId("table-header")
      .getByTestId("header-cell")
      .filter({ hasText: "Created At" })
      .first()
      .click();

    const columnPopover = popover(page);
    await columnPopover
      .getByText("Filter by this column", { exact: true })
      .click();
    await columnPopover.getByText("Fixed date range…", { exact: true }).click();
    await columnPopover.getByText("On", { exact: true }).click();

    // ensure the date picker is ready
    await expect(
      columnPopover.getByText("Add time", { exact: true }),
    ).toBeVisible();
    await expect(
      columnPopover.getByText("Add filter", { exact: true }),
    ).toBeVisible();

    // update the date input in the widget
    await columnPopover.getByLabel("Date", { exact: true }).fill("2027/5/15");
    await columnPopover.getByLabel("Date", { exact: true }).blur();

    // add a time to the date
    await columnPopover.getByText("Add time", { exact: true }).click();
    await columnPopover.getByLabel("Time", { exact: true }).fill("19:56");

    const dataset = waitForSetting(page, "POST", "/api/dataset");
    // apply the date filter
    await columnPopover
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await dataset;

    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);

    // verify that the correct row is displayed
    await expect(
      tableInteractive(page).getByText("2027/5/15, 19:56", { exact: true }),
    ).toBeVisible();
    await expect(
      tableInteractive(page).getByText("127.52", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > admin > settings > map settings", () => {
  const WORLD_GEOJSON_URL =
    "https://raw.githubusercontent.com/metabase/metabase/master/resources/frontend_client/app/assets/geojson/world.json";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to load and save a custom map", async ({ page }) => {
    await page.goto("/admin/settings/maps");
    await page.getByRole("button", { name: "Add a map", exact: true }).click();
    await page
      .getByPlaceholder("e.g. United Kingdom, Brazil, Mars")
      .fill("Test Map");
    await page
      .getByPlaceholder("Like https://my-mb-server.com/maps/my-map.json")
      .fill(WORLD_GEOJSON_URL);
    const geoJson = waitForSetting(page, "GET", "/api/geojson");
    await page.getByRole("button", { name: "Load", exact: true }).click();
    await geoJson;
    await page.getByTestId("map-region-key-select").click();
    await selectDropdown(page)
      .getByText("NAME", { exact: false })
      .first()
      .click();
    await page.getByTestId("map-region-name-select").click();
    await selectDropdown(page)
      .getByText("NAME", { exact: false })
      .first()
      .click();
    await page.getByRole("button", { name: "Add map", exact: true }).click();
    const content = page.getByTestId("admin-layout-content");
    await expect(content.getByText("Test Map", { exact: false })).toBeVisible();
    await expect(
      content.getByText(new RegExp("NAME"), { exact: false }),
    ).toHaveCount(0);
  });

  test("should be able to load a custom map even if a name has not been added yet (#14635)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/maps");
    await page.getByText("Add a map", { exact: true }).click();
    await page
      .getByPlaceholder("Like https://my-mb-server.com/maps/my-map.json")
      .fill(WORLD_GEOJSON_URL);
    const geoJson = waitForSetting(page, "GET", "/api/geojson");
    await page.getByText("Load", { exact: true }).click();
    const response = await geoJson;
    expect(response.status()).toBe(200);
  });

  test("should show an informative error when adding an invalid URL", async ({
    page,
  }) => {
    await page.goto("/admin/settings/maps");
    await page.getByText("Add a map", { exact: true }).click();
    await page
      .getByPlaceholder("Like https://my-mb-server.com/maps/my-map.json")
      .fill("bad-url");
    await page.getByText("Load", { exact: true }).click();
    await expect(
      page.getByText(
        "Invalid GeoJSON file location: must start with http:// or https://. " +
          "URLs referring to hosts that supply internal hosting metadata are prohibited.",
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("should show an informative error when adding a valid URL that does not contain GeoJSON, or is missing required fields", async ({
    page,
  }) => {
    await page.goto("/admin/settings/maps");
    await page.getByText("Add a map", { exact: true }).click();

    const urlInput = page.getByPlaceholder(
      "Like https://my-mb-server.com/maps/my-map.json",
    );
    // Not GeoJSON
    await urlInput.fill("https://www.metabase.com");
    await page.getByText("Load", { exact: true }).click();
    await expect(
      page.getByText("GeoJSON URL returned invalid content-type", {
        exact: true,
      }),
    ).toBeVisible();

    // GeoJSON with an unsupported format (not a Feature or FeatureCollection)
    await urlInput.fill(
      "https://raw.githubusercontent.com/metabase/metabase/master/test_resources/test.geojson",
    );
    await page.getByText("Load", { exact: true }).click();
    await expect(
      page.getByText("Invalid custom GeoJSON: does not contain features", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should show an informative error when adding a calid URL that contains GeoJSON that does not use lat/lng coordinates", async ({
    page,
  }) => {
    // intercept the call to api/geojson and return projected.geojson — the
    // real endpoint responds with JSON, so set the content type explicitly.
    const projected = readProjectedGeoJson();
    await page.route(
      (url) => url.pathname === "/api/geojson",
      (route) =>
        route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: projected,
        }),
    );

    await page.goto("/admin/settings/maps");
    await page.getByRole("button", { name: "Add a map", exact: true }).click();

    const dialog = modal(page);
    // GeoJSON with an unsupported format (not a Feature or FeatureCollection)
    await dialog
      .getByPlaceholder("Like https://my-mb-server.com/maps/my-map.json")
      .fill("http://assets/projected.geojson");
    await dialog.getByText("Load", { exact: true }).click();
    await expect(
      dialog.getByText(
        "Invalid custom GeoJSON: coordinates are outside bounds for latitude and longitude",
        { exact: true },
      ),
    ).toBeVisible();
  });
});

// Ensure the webhook tester docker container is running
// docker run -p 9080:8080/tcp tarampampam/webhook-tester:1.1.0 serve --create-session 00000000-0000-0000-0000-000000000000
test.describe("notifications", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(
      !(await isWebhookTesterRunning()),
      "@external: needs the webhook-tester container on :9080",
    );
    await mb.restore();
    await mb.signInAsAdmin();
    await resetWebhookTester(mb.api);
  });

  test.describe("Auth", () => {
    const COMMON_FIELDS = [
      { label: "Webhook URL", value: WEBHOOK_TEST_URL },
      { label: "Give it a name", value: "Awesome Hook" },
      { label: "Description", value: "The best hook ever" },
    ];

    // 3 Auth methods that add to the request. Unfortunately the webhook tester
    // docker image doesn't support query params at the moment.
    const AUTH_METHODS = [
      {
        display: "Basic",
        name: "Basic",
        populateFields: async (dialog: ReturnType<typeof modal>) => {
          await dialog.getByLabel("Username").fill("test@metabase.com");
          await dialog.getByLabel("Password").fill("password");
        },
        expected: ["Authorization", "Basic dGVzdEBtZXRhYmFzZS5jb206cGFzc3dvcmQ="],
      },
      {
        display: "Bearer",
        name: "Bearer",
        populateFields: async (dialog: ReturnType<typeof modal>) => {
          await dialog.getByLabel("Bearer token").fill("my-secret-token");
        },
        expected: ["Authorization", "Bearer my-secret-token"],
      },
      {
        display: "API Key - Header",
        name: "API Key",
        populateFields: async (dialog: ReturnType<typeof modal>) => {
          await dialog.getByLabel("Key", { exact: true }).fill("Mb_foo");
          await dialog.getByLabel("Value", { exact: true }).fill("mb-bar");
        },
        expected: ["Mb_foo", "mb-bar"],
      },
    ];

    for (const auth of AUTH_METHODS) {
      test(`${auth.display} Auth`, async ({ page }) => {
        await page.goto("/admin/settings/webhooks");
        await page
          .getByRole("heading", { name: "Add a webhook", exact: true })
          .click();

        const dialog = modal(page);
        for (const field of COMMON_FIELDS) {
          await dialog.getByLabel(field.label, { exact: true }).fill(field.value);
        }

        // Cypress `{force:true}` DISPATCHES the event; Playwright's force moves
        // the real mouse (PORTING). Mantine radios are sr-only inputs.
        await dialog
          .getByRole("radio", { name: auth.name, exact: true })
          .dispatchEvent("click");

        await auth.populateFields(dialog);

        await dialog
          .getByRole("button", { name: "Send a test", exact: true })
          .click();

        await expect(
          dialog.getByRole("button", { name: "Success", exact: true }),
        ).toBeVisible();
        await dialog
          .getByRole("button", { name: "Create destination", exact: true })
          .click();

        await expect(
          page.getByRole("heading", { name: "Awesome Hook", exact: true }),
        ).toBeVisible();

        await page.goto(WEBHOOK_TEST_DASHBOARD);
        await expect(
          page.getByRole("heading", { name: /Requests 1/ }),
        ).toBeVisible();

        for (const text of auth.expected) {
          await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
        }
      });
    }
  });

  test("Should allow you to create and edit Notifications", async ({
    page,
  }) => {
    await page.goto("/admin/settings/webhooks");

    await page
      .getByRole("heading", { name: "Add a webhook", exact: true })
      .click();

    const dialog = modal(page);
    await expect(
      dialog.getByRole("heading", {
        name: "New webhook destination",
        exact: true,
      }),
    ).toBeVisible();

    await dialog.getByLabel("Give it a name", { exact: true }).fill("Awesome Hook");
    await dialog
      .getByLabel("Description", { exact: true })
      .fill("The best hook ever");

    // should show error responses when testing
    await dialog
      .getByLabel("Webhook URL", { exact: true })
      .fill(WEBHOOK_TEST_HOST);
    await dialog.getByRole("button", { name: "Send a test", exact: true }).click();
    await expect(
      dialog.getByText("Test response", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByTestId("notification-test-response")).toContainText(
      "request-status",
    );
    await expect(dialog.getByTestId("notification-test-response")).toContainText(
      "request-body",
    );

    await dialog
      .getByLabel("Webhook URL", { exact: true })
      .fill(WEBHOOK_TEST_URL);
    await dialog.getByRole("button", { name: "Send a test", exact: true }).click();
    // Anchor (PORTING #73): the button relabels to "Success" once the test
    // request came back OK, which is the state in which "Test response" must
    // be absent. Without it the absence check samples the pre-response DOM.
    await expect(
      dialog.getByRole("button", { name: "Success", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Test response", { exact: true })).toHaveCount(
      0,
    );

    await dialog
      .getByRole("button", { name: "Create destination", exact: true })
      .click();

    await expect(
      page.getByRole("button", { name: /Add another/ }),
    ).toBeVisible();

    await page
      .getByRole("heading", { name: "Awesome Hook", exact: true })
      .click();

    const editDialog = modal(page);
    await expect(
      editDialog.getByRole("heading", {
        name: "Edit this webhook",
        exact: true,
      }),
    ).toBeVisible();
    await editDialog
      .getByLabel("Give it a name", { exact: true })
      .fill("Updated Hook");
    await editDialog
      .getByRole("button", { name: "Save changes", exact: true })
      .click();

    await page
      .getByRole("heading", { name: "Updated Hook", exact: true })
      .click();

    await modal(page)
      .getByRole("button", { name: /Delete this destination/ })
      .click();

    await expect(
      page.getByRole("heading", { name: "Add a webhook", exact: true }),
    ).toBeVisible();
  });
});

test.describe("admin > settings > updates", () => {
  // we're mocking this so it can be stable for tests
  const versionInfo = {
    latest: {
      version: "v1.56.4",
      released: "2022-10-14",
      rollout: 60,
      highlights: ["New latest feature", "Another new feature"],
    },
    beta: {
      version: "v1.56.75.3",
      released: "2022-10-15",
      rollout: 70,
      highlights: ["New beta feature", "Another new feature"],
    },
    nightly: {
      version: "v1.56.75.2",
      released: "2022-10-16",
      rollout: 80,
      highlights: ["New nightly feature", "Another new feature"],
    },
    older: [
      {
        version: "v1.56.1",
        released: "2022-10-10",
        rollout: 100,
        highlights: ["Some old feature", "Another old feature"],
      },
    ],
  };

  const currentVersion = "v1.55.2";

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await page.route(
      (url) => url.pathname === "/api/session/properties",
      async (route) => {
        const request = route.request();
        const response = await fetch(request.url(), {
          headers: await request.allHeaders(),
        });
        const body = (await response.json()) as {
          version: { tag: string };
        };
        body.version.tag = currentVersion;
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      },
    );

    await page.route(
      (url) => url.pathname === "/api/setting/version-info",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(versionInfo),
        }),
    );

    await page.goto("/admin/settings/updates");
  });

  test("should show the updates page", async ({ page }) => {
    await expect(
      page
        .getByTestId("check-for-updates-setting")
        .getByText("Check for updates", { exact: true }),
    ).toBeVisible();

    const updates = page.getByTestId("settings-updates");
    await expect(
      updates.getByText("Metabase 1.56.4 is available. You're running 1.55.2.", {
        exact: true,
      }),
    ).toBeVisible();

    await updates.getByText("Changelog", { exact: true }).click();
    // `/changelog/56` — the major of the mocked `latest.version` (v1.56.4),
    // via VersionUpdateNotice's `getLatestMajorVersion`. Tying the assertion
    // to the mock is what stops it being vacuous.
    await assertIframeLoaded(
      page,
      "changelog-iframe",
      /^https:\/\/www\.metabase\.com\/changelog\/56\?/,
    );

    await updates.getByText("What's new", { exact: true }).click();
    await assertIframeLoaded(
      page,
      "releases-iframe",
      /^https:\/\/www\.metabase\.com\/releases\?/,
    );
  });

});

test.describe("admin > settings > nav", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await page.goto("/admin/settings");
  });

  test("should navigate properly", async ({ page }) => {
    // sadly we can't test this in unit tests with the current state of
    // react-router and redux 😭

    // clicking sidebar nav links should navigate there
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toContain("/admin/settings/general");

    const sidebar = page.getByTestId("admin-layout-sidebar");
    const content = page.getByTestId("admin-layout-content");

    await sidebar.getByText(/email/i).first().click();
    await expect(content.getByText(/email/i).first()).toBeVisible();
    await expect.poll(() => page.url()).toContain("/admin/settings/email");

    // clicking folders should expand and collapse them, but not navigate
    await expect(sidebar.getByText(/api keys/i).first()).not.toBeVisible();
    await sidebar.getByText(/authentication/i).first().click();
    await expect(sidebar.getByText(/api keys/i).first()).toBeVisible();
    // still on email page
    await expect(content.getByText(/email/i).first()).toBeVisible();
    await expect.poll(() => page.url()).toContain("/admin/settings/email");
    // navigate to sub-item
    await sidebar.getByText(/api keys/i).first().click();
    await expect(content.getByText(/No API keys yet/i).first()).toBeVisible();
    await expect
      .poll(() => page.url())
      .toContain("/admin/settings/authentication/api-keys");
  });
});

// === local helpers ===

/** Poll maildev for the test email under test (see the getInbox note in
 * PORTING: H.getInbox returns as soon as the inbox is non-empty). */
async function waitForTestEmail() {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const inbox = await getInbox();
    const match = inbox.find((email) =>
      (email.text ?? "").includes("Your Metabase emails are working"),
    );
    if (match) {
      return match;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `Test email never arrived; inbox subjects: [${inbox
          .map((email) => email.subject)
          .join(", ")}]`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Availability probe for the maildev-ssl container (web API on :1081). */
async function isMaildevSslRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:1081/email", {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function isWebhookTesterRunning(): Promise<boolean> {
  try {
    const response = await fetch(
      `${WEBHOOK_TEST_HOST}/api/session/${WEBHOOK_TEST_SESSION_ID}/requests`,
      { signal: AbortSignal.timeout(2_000) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

function readProjectedGeoJson(): string {
  return fs.readFileSync(
    path.join(__dirname, "../../e2e/support/assets/projected.geojson"),
    "utf-8",
  );
}

/**
 * Port of the spec's `assertIframeLoaded`:
 *
 *   cy.findByTestId(testId).should("be.visible");
 *   cy.findByTestId(testId).should(($iframe) => {
 *     const body = $iframe.contents().find("body");
 *     expect(body).to.exist;
 *   });
 *
 * The second half is VACUOUS upstream, for two independent reasons. Both
 * iframes are CROSS-ORIGIN (`https://www.metabase.com/releases…` and
 * `…/changelog/<major>…`, VersionUpdateNotice.tsx:118-128), so jQuery's
 * `.contents()` returns an empty set; and `expect(<empty jQuery>).to.exist`
 * passes regardless, because a jQuery object is always a non-null object. It
 * cannot fail, whatever the iframe does.
 *
 * The literal Playwright translation this replaces —
 * `contentDocument?.body != null` — was not a faithful port but a STRONGER
 * assertion that no same-document script can ever satisfy against a
 * cross-origin frame: `contentDocument` is `null` by the same-origin policy,
 * so it was `false` by construction and the test failed deterministically,
 * with `Expected: true / Received: false` and no diagnostic.
 *
 * What is asserted instead is the strongest claim actually observable from the
 * parent document, and one a broken tab panel really would break: the iframe
 * is visible and points at the expected external document. `expectedSrc` is
 * matched, not merely present, so a panel that rendered the wrong tab's frame
 * fails — and the message names the src it got.
 *
 * NOT loading the frame content over `frameLocator` (which does cross origins
 * in Playwright): that would make an offline-safe test depend on reaching
 * metabase.com, which upstream never does.
 */
async function assertIframeLoaded(
  page: Page,
  testId: string,
  expectedSrc: RegExp,
) {
  const frame = page.getByTestId(testId);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("src", expectedSrc);
}

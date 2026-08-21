import { expect, test } from "../support/fixtures";
import { hovercard } from "../support/filter-bulk";
import { findByDisplayValue } from "../support/filters-repros";
import { tooltip } from "../support/charts";
import { publishChanges } from "../support/embedding-dashboard";
import { createQuestionAndDashboard } from "../support/factories";
import { configureSmtpSettings } from "../support/admin-extras";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  codeBlock,
  embedModalEnableEmbedding,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
} from "../support/sdk-embed-setup";
import {
  embedPreview,
  optionSwitch,
  toggleOptionSwitch,
  tooltipWarningInfoIcon,
} from "../support/sdk-embed-setup-select-embed-options";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { popover } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-options.cy.spec.ts
 *
 * The shared wizard helper lives in `support/sdk-embed-setup.ts` and is
 * consumed read-only (see findings-inbox/sdk-embed-setup.md). Spec-local
 * additions are in `support/sdk-embed-setup-select-embed-options.ts`.
 *
 * Port notes:
 *
 * - `H.mockEmbedJsToDevServer()` is dropped for the whole tier — the wizard's
 *   preview imports the embed runtime directly and never fetches `embed.js`
 *   (sdk-embed-setup.ts header).
 * - SNOWPLOW IS THE SUBJECT of the third describe (11 of its 15 tests assert
 *   `embed_wizard_options_completed`, and `afterEach` asserts no bad events),
 *   so rule 6's no-op stub is wrong here: it uses `installSnowplowCapture`
 *   (browser-boundary capture), the same decision made for
 *   `sdk-embed-setup-get-code`. The OSS / "EE without license" describes call
 *   `H.resetSnowplow()`/`H.enableTracking()` but assert nothing about events,
 *   so there the tracking setting is issued and no capture is installed.
 * - `cy.intercept("GET","/api/dashboard/**").as("dashboard")` and
 *   `cy.intercept("POST","/api/card/*​/query").as("cardQuery")` are never
 *   awaited by any test in the file → dropped (rule 2). The one intercept that
 *   IS awaited, `@persistSettings`, is armed before its trigger in the single
 *   test that uses it.
 * - `H.setupSMTP()` is ported as `configureSmtpSettings` — the Cypress helper
 *   PUTs `/api/email`, which live-validates the SMTP connection against the
 *   maildev container. These three tests only need the "email is configured"
 *   state (they never send mail), so the settings are written through
 *   `PUT /api/setting`, which skips validation and needs no container. Recorded
 *   as a deviation in the findings.
 * - `should("not.exist")` RETRIES in Cypress and passes at the first absent
 *   observation, so `expect(loc).toHaveCount(0)` is the EQUIVALENT, faithful
 *   port. An earlier (wrong) revision of PORTING.md called for a non-retrying
 *   `expect(await loc.count()).toBe(0)`; that was the first shape here and it
 *   FLAKED (1 failure in 36 executions of "toggles chart title for charts"):
 *   every absence in this spec follows an embed-option toggle, and the wizard
 *   re-renders the preview in place, so a count read the instant after the
 *   toggle can still see the outgoing DOM. All of them are STEADY-STATE
 *   absences (the title stays hidden while the switch is off, the widget stays
 *   absent while the option is off). Converting them to `toHaveCount(0)` gave
 *   63/63. This spec is the evidence that corrected the PORTING.md rule.
 *   The `H.getSimpleEmbedIframeContent()` prefix is separately NOT vacuous — it
 *   carries a retrying "preview iframe has loaded" assertion, preserved by
 *   `embedPreview()`.
 * - Mantine `Switch` inputs are visually hidden → `click({ force: true })`
 *   (rule 4), wrapped in `toggleOptionSwitch`.
 * - `.trigger("mouseenter")` / `.trigger("mouseover")` → `dispatchEvent(...)`.
 *   Cypress's `.trigger()` defaults to `{ bubbles: true }`, which is what makes
 *   React's delegated `onMouseEnter` fire; a real `hover()` would also work for
 *   the HoverCard but reintroduces the hit-testing problem the upstream comment
 *   describes (the icon sits next to a disabled input).
 */

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed options";

test.describe("OSS", () => {
  test.describe(suiteTitle, () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.updateSetting("anon-tracking-enabled", true);
      await mb.api.updateSetting("enable-embedding-simple", true);
    });

    test("should show upsell for Allow subscriptions option", async ({
      page,
    }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: DASHBOARD_NAME,
      });

      await expect(
        getEmbedSidebar(page).getByTestId("upsell-card"),
      ).toBeVisible();
    });

    test("should show upsell for Allow alerts option", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "chart",
        resourceName: QUESTION_NAME,
      });

      await expect(
        getEmbedSidebar(page).getByTestId("upsell-card"),
      ).toBeVisible();
    });
  });
});

test.describe("EE without license", () => {
  test.describe(suiteTitle, () => {
    test.beforeEach(async ({ mb }) => {
      await mb.restore();
      await mb.signInAsAdmin();
      await mb.api.activateToken("starter");
      await mb.api.updateSetting("anon-tracking-enabled", true);
      await mb.api.updateSetting("enable-embedding-simple", true);
    });

    test("should show upsell banner", async ({ page }) => {
      await navigateToEmbedOptionsStep(page, {
        experience: "dashboard",
        resourceName: DASHBOARD_NAME,
      });

      await expect(
        getEmbedSidebar(page).getByTestId("upsell-card"),
      ).toBeVisible();
    });
  });
});

test.describe(suiteTitle, () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);
    // Required for the `metabot` experience card to render at all — it is
    // gated on `useMetabotEnabledEmbeddingAware`. Without it the two metabot
    // tests below fail inside the shared navigation helper.
    await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");

    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  // Port of upstream's `afterEach(H.expectNoBadSnowplowEvents)`. Downgraded to
  // a structural check (support/search-snowplow.ts) — micro's Iglu schema
  // validation has no container-free equivalent.
  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test("toggles drill-throughs for dashboards when SSO auth method is selected", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(
      optionSwitch(page, "Allow people to drill through on data points"),
    ).toBeChecked();

    // drill-through should be enabled in the preview
    const preview = await embedPreview(page);
    await preview.getByText("110.93", { exact: true }).click();
    await expect(
      preview.getByText("Filter by this value", { exact: true }),
    ).toBeVisible();

    // turn off drill-through
    await toggleOptionSwitch(
      page,
      "Allow people to drill through on data points",
      false,
    );

    // drill-through should be disabled in the preview
    const previewAfter = await embedPreview(page);
    await previewAfter.getByText("110.93", { exact: true }).click();
    await expect(
      previewAfter.getByText("Filter by this value", { exact: true }),
    ).toHaveCount(0);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=dashboard,authType=sso,drills=false,withDownloads=false,withSubscriptions=false,withTitle=true,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText('drills="false"');
  });

  test("toggles downloads for dashboard", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    await expect(optionSwitch(page, "Allow downloads")).not.toBeChecked();

    const preview = await embedPreview(page);
    await expect(preview.getByTestId("export-as-pdf-button")).toHaveCount(0);

    // turn on downloads
    await toggleOptionSwitch(page, "Allow downloads", true);

    const previewAfter = await embedPreview(page);
    await expect(
      previewAfter.getByTestId("export-as-pdf-button"),
    ).toBeVisible();

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=true,withSubscriptions=false,withTitle=true,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText(
      'with-subscriptions="false"',
    );
  });

  test("cannot select subscriptions for dashboard when email is not set up", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectGuest: true,
    });

    await expect(optionSwitch(page, "Allow subscriptions")).not.toBeChecked();
    await expect(optionSwitch(page, "Allow subscriptions")).toBeDisabled();

    // Email warning should only be shown on non-guest embedding
    await tooltipWarningInfoIcon(page, "Allow subscriptions").dispatchEvent(
      "mouseenter",
    );
    await expect(tooltip(page).first()).toContainText(
      "Not available if Guest Mode is selected",
    );

    const preview = await embedPreview(page);
    await expect(
      preview.getByRole("button", { name: "Subscriptions" }),
    ).toHaveCount(0);

    // snippet should show subscriptions as false
    const sidebar = getEmbedSidebar(page);
    await sidebar.getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });

    // test non-guest embeds
    await sidebar.getByRole("button", { name: "Back", exact: true }).click();
    // Gate the second Back on the embed-options step having rendered: both
    // steps label the button "Back", so two back-to-back clicks can otherwise
    // land on the same step (Cypress's command queue paced them apart).
    await expect(sidebar.getByText("Get code", { exact: true })).toBeVisible();
    await sidebar.getByRole("button", { name: "Back", exact: true }).click();

    await sidebar
      .getByLabel("Metabase account (SSO)", { exact: true })
      .click();

    await embedModalEnableEmbedding(page);

    await sidebar.getByRole("button", { name: "Next", exact: true }).click();

    await tooltipWarningInfoIcon(page, "Allow subscriptions").dispatchEvent(
      "mouseover",
    );
    await expect(hovercard(page).first()).toContainText(
      "To allow subscriptions, set up email in admin settings",
    );
  });

  test("toggles subscriptions for dashboard when email is set up", async ({
    page,
    mb,
  }) => {
    await configureSmtpSettings(mb.api);
    const dashboardName = "Dashboard with parameter";

    // Create a dashboard with a single parameter mapped to a card
    const parameter = {
      id: "1b9cd9f1",
      name: "Category",
      slug: "category",
      type: "string/=",
      sectionId: "string",
    };

    const { id, card_id, dashboard_id } = await createQuestionAndDashboard(
      mb.api,
      {
        questionDetails: {
          display: "table",
          query: { "source-table": PRODUCTS_ID },
        },
        dashboardDetails: {
          name: dashboardName,
          parameters: [parameter],
        },
      },
    );

    await mb.api.put(`/api/dashboard/${dashboard_id}`, {
      dashcards: [
        {
          id,
          card_id,
          row: 0,
          col: 0,
          size_x: 16,
          size_y: 8,
          parameter_mappings: [
            {
              parameter_id: parameter.id,
              card_id,
              target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
            },
          ],
          visualization_settings: {},
        },
      ],
    });

    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: dashboardName,
      preselectSso: true,
    });

    await expect(optionSwitch(page, "Allow subscriptions")).not.toBeChecked();

    const preview = await embedPreview(page);
    await expect(
      preview.getByRole("button", { name: "Subscriptions" }),
    ).toHaveCount(0);

    // turn on subscriptions
    await toggleOptionSwitch(page, "Allow subscriptions", true);

    // assert that unchecking subscriptions will close the subscription sidebar
    const previewOn = await embedPreview(page);
    const subscriptionsButton = previewOn.getByRole("button", {
      name: "Subscriptions",
    });
    await expect(subscriptionsButton).toBeVisible();
    await subscriptionsButton.click();

    await expect(
      previewOn.getByRole("heading", { name: "Email this dashboard" }),
    ).toBeVisible();

    // can customize filter values
    await expect(
      previewOn.getByRole("heading", {
        name: "Set filter values for when this gets sent",
      }),
    ).toBeVisible();

    const dashboardEl = previewOn.getByTestId("dashboard");
    await expect(dashboardEl).toBeVisible();
    const box = await dashboardEl.boundingBox();
    const EXPECTED_APPROX_WIDTH = 800;
    const ERROR_TOLERANCE = 50;
    expect(
      box?.width,
      "EAJS preview should scale when opening a dashboard sidebar (EMB-1120)",
    ).toBeGreaterThanOrEqual(EXPECTED_APPROX_WIDTH - ERROR_TOLERANCE);
    expect(
      box?.width,
      "EAJS preview should scale when opening a dashboard sidebar (EMB-1120)",
    ).toBeLessThanOrEqual(EXPECTED_APPROX_WIDTH + ERROR_TOLERANCE);

    await toggleOptionSwitch(page, "Allow subscriptions", false);
    const previewOff = await embedPreview(page);
    await expect(
      previewOff.getByRole("heading", { name: "Email this dashboard" }),
    ).toHaveCount(0);

    // toggle subscriptions back on
    await toggleOptionSwitch(page, "Allow subscriptions", true);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=false,withSubscriptions=true,withTitle=true,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText(
      'with-subscriptions="true"',
    );
  });

  test("toggles dashboard title for dashboards", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectGuest: true,
    });

    await publishChanges(page, "dashboard");

    await expect(
      page.getByRole("button", { name: "Unpublish", exact: true }),
    ).toBeVisible();

    await expect(optionSwitch(page, "Show dashboard title")).toBeChecked();

    const preview = await embedPreview(page);
    await expect(
      preview.getByText("Orders in a dashboard", { exact: true }),
    ).toBeVisible();

    // turn off title
    await toggleOptionSwitch(page, "Show dashboard title", false);

    const previewAfter = await embedPreview(page);
    await expect(
      previewAfter.getByText("Orders in a dashboard", { exact: true }),
    ).toHaveCount(0);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        'settings=custom,experience=dashboard,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withSubscriptions=false,withTitle=false,params={"disabled":0,"locked":0,"enabled":0},theme=default',
    });

    await expect(codeBlock(page).first()).toContainText('with-title="false"');
  });

  test("toggles drill-through for charts for SSO auth mode", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    await expect(
      optionSwitch(page, "Allow people to drill through on data points"),
    ).toBeChecked();

    // drill-through should be enabled by default in chart preview
    const preview = await embedPreview(page);
    await preview.getByText("18,760", { exact: true }).click();
    await expect(
      preview.getByText("See these Orders", { exact: true }),
    ).toHaveCount(1);

    // turn off drill-through
    await toggleOptionSwitch(
      page,
      "Allow people to drill through on data points",
      false,
    );

    // drill-through should be disabled in chart preview
    const previewAfter = await embedPreview(page);
    await previewAfter.getByText("18,760", { exact: true }).click();
    await expect(
      previewAfter.getByText("See these Orders", { exact: true }),
    ).toHaveCount(0);

    // allow downloads should be visible when drills are off (EMB-712)
    await expect(optionSwitch(page, "Allow downloads")).toBeVisible();

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();
    await expect(codeBlock(page).first()).toContainText('drills="false"');
  });

  test("toggles downloads for charts", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectGuest: true,
    });

    await publishChanges(page, "card");

    await expect(
      page.getByRole("button", { name: "Unpublish", exact: true }),
    ).toBeVisible();

    await expect(optionSwitch(page, "Allow downloads")).not.toBeChecked();

    const preview = await embedPreview(page);
    await expect(
      preview.getByTestId("question-download-widget-button"),
    ).toHaveCount(0);

    // turn on downloads
    await toggleOptionSwitch(page, "Allow downloads", true);

    const previewAfter = await embedPreview(page);
    await expect(
      previewAfter.getByTestId("question-download-widget-button"),
    ).toBeVisible();

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        'settings=custom,experience=chart,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=true,withAlerts=false,withTitle=true,isSaveEnabled=false,params={"disabled":0,"locked":0,"enabled":0},theme=default',
    });

    await expect(codeBlock(page).first()).toContainText(
      'with-downloads="true"',
    );
  });

  test("toggles chart title for charts", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    // chart title should be visible by default
    await expect(optionSwitch(page, "Show chart title")).toBeChecked();
    const preview = await embedPreview(page);
    await expect(
      preview.getByText("Orders, Count", { exact: true }),
    ).toBeVisible();

    // turn off title
    await expect(optionSwitch(page, "Show chart title")).toBeChecked();
    await toggleOptionSwitch(page, "Show chart title", false);

    const previewNoTitle = await embedPreview(page);
    await expect(
      previewNoTitle.getByText("Orders, Count", { exact: true }),
    ).toHaveCount(0);

    // set drills to false
    await expect(
      optionSwitch(page, "Allow people to drill through on data points"),
    ).toBeChecked();
    await toggleOptionSwitch(
      page,
      "Allow people to drill through on data points",
      false,
    );

    // chart title state should remain unchecked
    await expect(optionSwitch(page, "Show chart title")).not.toBeChecked();

    // chart title should remain hidden
    const previewStillNoTitle = await embedPreview(page);
    await expect(
      previewStillNoTitle.getByText("Orders, Count", { exact: true }),
    ).toHaveCount(0);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();
    await expect(codeBlock(page).first()).toContainText('with-title="false"');

    // go back to embed options step
    await getEmbedSidebar(page).getByText("Back", { exact: true }).click();

    // show the chart title
    await expect(optionSwitch(page, "Show chart title")).not.toBeChecked();
    await toggleOptionSwitch(page, "Show chart title", true);

    // chart title should be visible again
    const previewWithTitle = await embedPreview(page);
    await expect(
      previewWithTitle.getByText("Orders, Count", { exact: true }),
    ).toBeVisible();
  });

  test("cannot select alerts for question when email is not set up", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectGuest: true,
    });

    await expect(optionSwitch(page, "Allow alerts")).not.toBeChecked();
    await expect(optionSwitch(page, "Allow alerts")).toBeDisabled();

    // Email warning should only be shown on non-guest embedding
    await tooltipWarningInfoIcon(page, "Allow alerts").dispatchEvent(
      "mouseenter",
    );
    await expect(tooltip(page).first()).toContainText(
      "Not available if Guest Mode is selected",
    );

    const preview = await embedPreview(page);
    await expect(preview.getByRole("button", { name: "Alerts" })).toHaveCount(
      0,
    );

    // snippet should show alerts as false
    const sidebar = getEmbedSidebar(page);
    await sidebar.getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });

    // test non-guest embeds
    await sidebar.getByRole("button", { name: "Back", exact: true }).click();
    await expect(sidebar.getByText("Get code", { exact: true })).toBeVisible();
    await sidebar.getByRole("button", { name: "Back", exact: true }).click();

    await sidebar
      .getByLabel("Metabase account (SSO)", { exact: true })
      .click();

    await embedModalEnableEmbedding(page);

    await sidebar.getByRole("button", { name: "Next", exact: true }).click();

    await tooltipWarningInfoIcon(page, "Allow alerts").dispatchEvent(
      "mouseover",
    );
    await expect(hovercard(page).first()).toContainText(
      "To allow alerts, set up email in admin settings",
    );
  });

  test("toggles alerts for question when email is set up", async ({
    page,
    mb,
  }) => {
    await configureSmtpSettings(mb.api);

    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    await expect(optionSwitch(page, "Allow alerts")).not.toBeChecked();

    const preview = await embedPreview(page);
    await expect(preview.getByRole("button", { name: "Alerts" })).toHaveCount(
      0,
    );

    // turn on alerts
    await toggleOptionSwitch(page, "Allow alerts", true);

    // assert that alert button appears in preview
    const previewOn = await embedPreview(page);
    await expect(
      previewOn.getByRole("button", { name: "Alerts" }),
    ).toBeVisible();

    // test that with drills off, alerts still work because it will now render
    // <StaticQuestion /> (from <SdkQuestion />)
    await expect(
      optionSwitch(page, "Allow people to drill through on data points"),
    ).toBeChecked();
    await toggleOptionSwitch(
      page,
      "Allow people to drill through on data points",
      false,
    );
    const previewNoDrills = await embedPreview(page);
    await expect(
      previewNoDrills.getByRole("button", { name: "Alerts" }),
    ).toBeVisible();

    // assert that unchecking alerts will close the alert modal
    const newAlertModalTitle = "New alert";
    const alertsButton = previewNoDrills.getByRole("button", {
      name: "Alerts",
    });
    await expect(alertsButton).toBeVisible();
    await alertsButton.click();

    await expect(
      previewNoDrills.getByRole("heading", { name: newAlertModalTitle }),
    ).toBeVisible();

    await toggleOptionSwitch(page, "Allow alerts", false);
    const previewOff = await embedPreview(page);
    await expect(
      previewOff.getByRole("heading", { name: newAlertModalTitle }),
    ).toHaveCount(0);

    // toggle alerts back on
    await toggleOptionSwitch(page, "Allow alerts", true);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=chart,authType=sso,drills=false,withDownloads=false,withAlerts=true,withTitle=true,isSaveEnabled=false,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText('with-alerts="true"');
  });

  test("shows a docs icon in behavior section depending on a component", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "chart",
      resourceName: QUESTION_NAME,
      preselectSso: true,
    });

    const sidebar = getEmbedSidebar(page);

    await expect(sidebar.getByTestId("behavior-docs-link")).toBeVisible();
    await expect(sidebar.getByTestId("behavior-docs-link")).toHaveAttribute(
      "href",
      /embedding\/components\.html#question/,
    );

    await sidebar.getByText("Back", { exact: true }).click();

    await sidebar.getByText("Metabot", { exact: true }).click();
    await sidebar.getByText("Next", { exact: true }).click();

    await expect(sidebar.getByTestId("behavior-docs-link")).toHaveCount(0);
  });

  for (const experience of ["exploration", "chart"] as const) {
    test(`toggles save button for ${experience}`, async ({ page }) => {
      await navigateToEmbedOptionsStep(
        page,
        experience === "chart"
          ? {
              experience: "chart",
              resourceName: QUESTION_NAME,
              preselectSso: true,
            }
          : { experience: "exploration", preselectSso: true },
      );

      if (experience === "exploration") {
        // visualize a question to enable the save button
        const preview = await embedPreview(page);
        await preview.getByText("Orders", { exact: true }).click();
        await preview.getByText("Visualize", { exact: true }).click();
      }

      await expect(
        optionSwitch(page, "Allow people to save new questions"),
      ).not.toBeChecked();

      // save button should be hidden by default
      const preview = await embedPreview(page);
      await expect(preview.getByText("Save", { exact: true })).toHaveCount(0);

      // turn on save option
      await toggleOptionSwitch(
        page,
        "Allow people to save new questions",
        true,
      );

      if (experience === "chart") {
        // select a different visualization to enable the save button
        const chartPreview = await embedPreview(page);
        await chartPreview.getByTestId("chart-type-selector-button").click();
        await chartPreview
          .getByRole("listbox")
          .getByText("Number", { exact: true })
          .click();
      }

      const previewAfter = await embedPreview(page);
      await expect(
        previewAfter.getByText("Save", { exact: true }),
      ).toBeVisible();

      // snippet should be updated
      await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

      await expectUnstructuredSnowplowEvent(snowplow, {
        event: "embed_wizard_options_completed",
        event_detail:
          experience === "chart"
            ? "settings=custom,experience=chart,authType=sso,drills=true,withDownloads=false,withAlerts=false,withTitle=true,isSaveEnabled=true,theme=default"
            : "settings=custom,experience=exploration,authType=sso,isSaveEnabled=true,theme=default",
      });

      await expect(codeBlock(page).first()).toContainText(
        'is-save-enabled="true"',
      );
    });
  }

  test("toggles save button for metabot", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, { experience: "metabot" });

    await expect(
      optionSwitch(page, "Allow people to save new questions"),
    ).not.toBeChecked();

    // turn on save option
    await toggleOptionSwitch(page, "Allow people to save new questions", true);

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=metabot,authType=sso,isSaveEnabled=true,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText(
      'is-save-enabled="true"',
    );
  });

  test("can toggle read-only setting for browser", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "browser",
      resourceName: "First collection",
    });

    await expect(
      optionSwitch(page, "Allow editing dashboards and questions"),
    ).not.toBeChecked();

    const preview = await embedPreview(page);
    await expect(
      preview.getByText("New dashboard", { exact: true }),
    ).toHaveCount(0);

    // turn on editing (set read-only to false)
    await toggleOptionSwitch(
      page,
      "Allow editing dashboards and questions",
      true,
    );

    const previewAfter = await embedPreview(page);
    await expect(
      previewAfter.getByText("New dashboard", { exact: true }),
    ).toBeVisible();

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=browser,authType=sso,readOnly=false,theme=default",
    });

    await expect(codeBlock(page).first()).toContainText('read-only="false"');
  });

  test("can change brand color and reset colors", async ({ page }) => {
    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectGuest: true,
    });

    await publishChanges(page, "dashboard");

    await expect(
      page.getByRole("button", { name: "Unpublish", exact: true }),
    ).toBeVisible();

    // Selecting custom colors
    await page.getByTestId("theme-card-Custom").click();

    // brand color should be visible
    await expect(
      getEmbedSidebar(page).getByText("Brand color", { exact: true }),
    ).toBeVisible();

    // reset button should not be visible initially
    await expect(
      getEmbedSidebar(page).getByLabel("Reset colors", { exact: true }),
    ).toHaveCount(0);

    // click on brand color picker
    await page
      .getByTestId("brand-color-picker")
      .getByRole("button")
      .click();

    // change brand color to red
    const brandInput = await findByDisplayValue(popover(page), "#509EE2");
    await expect(brandInput).toBeVisible();
    await brandInput.fill("");
    await brandInput.pressSequentially("rgb(255, 0, 0)");

    // table header cell should now be red
    const preview = await embedPreview(page);
    await expect(preview.getByTestId("cell-data").first()).toHaveCSS(
      "color",
      "rgb(255, 0, 0)",
    );

    // reset button should now be visible
    await expect(
      getEmbedSidebar(page).getByLabel("Reset colors", { exact: true }),
    ).toBeVisible();

    // snippet should be updated
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        'settings=custom,experience=dashboard,guestEmbedEnabled=true,guestEmbedType=guest-embed,authType=guest-embed,drills=false,withDownloads=false,withSubscriptions=false,withTitle=true,params={"disabled":0,"locked":0,"enabled":0},theme=custom',
    });

    await expect(codeBlock(page).first()).toContainText('"theme": {');
    await expect(codeBlock(page).first()).toContainText('"colors": {');
    await expect(codeBlock(page).first()).toContainText('"brand": "#FF0000"');

    // go back to embed options step
    await getEmbedSidebar(page).getByText("Back", { exact: true }).click();

    // click reset button
    await getEmbedSidebar(page)
      .getByLabel("Reset colors", { exact: true })
      .click();

    // table header should be back to default blue
    const previewReset = await embedPreview(page);
    await expect(previewReset.getByTestId("cell-data").first()).toHaveCSS(
      "color",
      "rgb(80, 158, 226)",
    );

    // reset button should be hidden again
    await expect(
      getEmbedSidebar(page).getByLabel("Reset colors", { exact: true }),
    ).toHaveCount(0);

    // snippet should not contain theme colors
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();
    await expect(codeBlock(page).first()).not.toContainText('"theme": {');

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail: "settings=default",
    });
  });

  test("derives colors for dark theme palette", async ({ page, mb }) => {
    /**
     * There's a problem on CI where the hovercard on allow subscriptions is
     * open when email is not set up and that is counted in H.popover() making
     * H.popover().within() fail. Setting up the email should prevent such a
     * hovercard from showing up.
     */
    await configureSmtpSettings(mb.api);

    await navigateToEmbedOptionsStep(page, {
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
      preselectSso: true,
    });

    // Port of `cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings")
    // .as("persistSettings")` + the trailing `cy.wait("@persistSettings")`.
    // Rule 2: armed before the theme edits that trigger the debounced persist,
    // awaited at the end of the test.
    const persistSettings = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname ===
          "/api/setting/sdk-iframe-embed-setup-settings",
    );

    // Selecting custom colors
    await page.getByTestId("theme-card-Custom").click();

    // click on brand color picker
    await page.getByTestId("brand-color-picker").getByRole("button").click();
    const brandInput = await findByDisplayValue(popover(page), "#509EE2");
    await brandInput.fill("");
    await brandInput.pressSequentially("#BD51FD");

    // change primary text color
    await page
      .getByTestId("text-primary-color-picker")
      .getByRole("button")
      .click();
    const textInput = await findByDisplayValue(popover(page), "#303D46");
    await textInput.fill("");
    await textInput.pressSequentially("#F1F1F1");

    // change background color
    await page
      .getByTestId("background-color-picker")
      .getByRole("button")
      .click();
    const backgroundInput = await findByDisplayValue(popover(page), "#FFFFFF");
    await backgroundInput.fill("");
    await backgroundInput.pressSequentially("#121212");

    // verify the preview reflects the dark theme
    const preview = await embedPreview(page);
    await expect(preview.getByTestId("dashboard")).toHaveCSS(
      "background-color",
      "rgb(18, 18, 18)",
    );

    // check that derived colors are applied to snippet
    await getEmbedSidebar(page).getByText("Get code", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=dashboard,authType=sso,drills=true,withDownloads=false,withSubscriptions=false,withTitle=true,theme=custom",
    });

    // derived-colors-for-embed-flow.unit.spec.ts contains the tests for other
    // derived colors.
    await expect(codeBlock(page).first()).toContainText(
      '"text-secondary": "rgb(169, 169, 169)"',
    );
    await expect(codeBlock(page).first()).toContainText(
      '"brand-hover": "rgba(189, 81, 253, 0.5)"',
    );

    // Should no longer derive background-hover as it is color-mix'd in the
    // colors configuration
    await expect(codeBlock(page).first()).not.toContainText(
      '"background-hover"',
    );

    // Wait for the debounced theme persist to land before the test ends —
    // otherwise the orphaned `_.debounce` callback in `useUserSetting` fires
    // after the next test's restore and writes the custom theme back into the
    // freshly-restored DB, polluting downstream snowplow assertions. Proper fix
    // (flush-on-unmount in `useUserSetting`) tracked in EMB-1795.
    await persistSettings;
  });

  test("can toggle the Metabot layout from auto to stacked to sidebar", async ({
    page,
  }) => {
    await navigateToEmbedOptionsStep(page, { experience: "metabot" });

    const sidebar = getEmbedSidebar(page);

    await expect(sidebar.getByLabel("Auto", { exact: true })).toBeChecked();
    await sidebar
      .getByLabel("Stacked", { exact: true })
      .click({ force: true });
    await expect(sidebar.getByLabel("Stacked", { exact: true })).toBeChecked();

    const preview = await embedPreview(page);
    await expect(
      preview.getByTestId("metabot-question-container"),
    ).toHaveAttribute("data-layout", "stacked");

    await sidebar.getByText("Get code", { exact: true }).click();
    await expect(codeBlock(page).first()).toContainText('layout="stacked"');

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=metabot,authType=sso,isSaveEnabled=false,layout=stacked,theme=default",
    });

    await sidebar.getByText("Back", { exact: true }).click();
    await sidebar
      .getByLabel("Sidebar", { exact: true })
      .click({ force: true });
    await expect(sidebar.getByLabel("Sidebar", { exact: true })).toBeChecked();

    const previewSidebar = await embedPreview(page);
    await expect(
      previewSidebar.getByTestId("metabot-question-container"),
    ).toHaveAttribute("data-layout", "sidebar");

    await sidebar.getByText("Get code", { exact: true }).click();
    await expect(codeBlock(page).first()).toContainText('layout="sidebar"');

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_options_completed",
      event_detail:
        "settings=custom,experience=metabot,authType=sso,isSaveEnabled=false,layout=sidebar,theme=default",
    });
  });
});

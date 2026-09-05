import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { entityPickerModal, entityPickerModalLevel } from "../support/notebook";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { ORDERS_COUNT_QUESTION_ID } from "../support/collections-reproductions";
import {
  embedModalEnableEmbedding,
  getEmbedSidebar,
  getResourceSelectorButton,
  logRecent,
  visitNewEmbedPage,
} from "../support/sdk-embed-setup";
import {
  capturePreviewEmbedDashboardRequests,
  captureWizardDashboardResponses,
  waitForDashboardResponse,
} from "../support/sdk-embed-setup-select-embed-entity";
import { embedPreview } from "../support/sdk-embed-setup-select-embed-options";
import type { SnowplowCapture } from "../support/search-snowplow";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import { main } from "../support/ui";

/**
 * Port of
 * e2e/test/scenarios/embedding/sdk-iframe-embedding-setup/select-embed-entity.cy.spec.ts
 *
 * Group B (the embed SETUP wizard), entity-selection step. The shared wizard
 * helper `support/sdk-embed-setup.ts` is consumed read-only and needed no
 * changes (as with the five Group B specs already landed); the only new code is
 * the pair of passive recorders in
 * `support/sdk-embed-setup-select-embed-entity.ts`.
 *
 * Port notes:
 *
 * - `H.mockEmbedJsToDevServer()` is dropped for the whole tier — the wizard's
 *   preview imports the embed runtime directly and never fetches `embed.js`
 *   (see `support/sdk-embed-setup.ts`'s header).
 * - SNOWPLOW IS THE SUBJECT of the first describe: 4 of its 6 tests assert
 *   `embed_wizard_resource_selection_completed`, and `afterEach` asserts no bad
 *   events. Rule 6's no-op stub would delete that coverage, so this uses
 *   `installSnowplowCapture` (browser-boundary capture), as the other Group B
 *   ports do. `H.enableTracking()` is still issued so the backend state matches
 *   upstream. The second describe calls neither, so no capture is installed
 *   there.
 * - Intercepts: `@cardQuery` and `@recentActivity` (and `@searchQuery` in the
 *   second describe) are never awaited by any test → dropped (rule 2).
 *   `@dashboard` and `@previewEmbed` ARE awaited, but both retroactively, so
 *   they are ported as passive recorders — see the module header for why an
 *   armed `waitForResponse` would be wrong at those sites.
 * - `H.getSimpleEmbedIframeContent()` is not a bare accessor: it retryingly
 *   asserts the preview iframe exists AND carries `data-iframe-loaded` before
 *   scoping in. `embedPreview()` (support/sdk-embed-setup-select-embed-options.ts)
 *   is that gate; using it keeps the implicit anchor a naive
 *   `getSimpleEmbedIframe` port would drop.
 * - `should("contain", …)` on the resource-selector button is a *substring*
 *   assertion → `toContainText`. Note "Orders, Count" is a substring of
 *   "Orders, Count, Grouped by Created At (year)"; that weakness is upstream's
 *   and is preserved rather than silently strengthened.
 * - `cy.findByText(…)` with a string is exact in testing-library (rule 1) →
 *   `{ exact: true }`. Where upstream relies on testing-library's
 *   throw-on-multiple to prove uniqueness but the same text can plausibly
 *   render twice in a portal, `.first()` is used with a comment.
 */

const { ORDERS_ID } = SAMPLE_DATABASE;

const FIRST_DASHBOARD_NAME = "Orders in a dashboard";
const SECOND_DASHBOARD_NAME = "Acme Inc";
const FIRST_QUESTION_NAME = "Orders, Count";
const SECOND_QUESTION_NAME = "Orders, Count, Grouped by Created At (year)";

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > select embed entity";

test.describe(suiteTitle, () => {
  let snowplow: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    // Port of H.enableTracking().
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.updateSetting("enable-embedding-simple", true);

    // Port of H.resetSnowplow() + the micro-backed assertions: the capture is
    // installed fresh per test, so it starts empty.
    snowplow = await installSnowplowCapture(page, mb.baseUrl);
  });

  // Port of upstream's `afterEach(H.expectNoBadSnowplowEvents)`. Downgraded to
  // a structural check (see support/search-snowplow.ts) — micro's Iglu schema
  // validation has no container-free equivalent.
  test.afterEach(() => {
    expectNoBadSnowplowEvents(snowplow);
  });

  test("tracks event details with `isDefaultResource=true` when keeping the default dashboard selection", async ({
    page,
  }) => {
    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await expect(
      sidebar.getByText("Select a dashboard to embed", { exact: true }),
    ).toBeVisible();

    // a default dashboard is preselected
    await expect(getResourceSelectorButton(page)).toContainText(
      FIRST_DASHBOARD_NAME,
    );

    await sidebar.getByText("Next", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=true,experience=dashboard",
    });
  });

  test("tracks event details with `isDefaultResource=false` when selecting a different dashboard", async ({
    page,
    mb,
  }) => {
    const previewEmbedRequests = capturePreviewEmbedDashboardRequests(page);

    // add two dashboards to activity log
    const { id: secondDashboardId } = await mb.api.createDashboard({
      name: SECOND_DASHBOARD_NAME,
    });
    await logRecent(mb.api, "dashboard", secondDashboardId);
    await logRecent(mb.api, "dashboard", ORDERS_DASHBOARD_ID);

    const dashboardResponses = captureWizardDashboardResponses(page);

    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await expect(
      sidebar.getByText("Select a dashboard to embed", { exact: true }),
    ).toBeVisible();

    // see the "shows recently created dashboard at the top of the list
    // (EMB-1179)" test below for why we prioritize new dashboards.
    // recently created dashboard should be selected by default (EMB-1179)
    await expect(getResourceSelectorButton(page)).toContainText(
      SECOND_DASHBOARD_NAME,
    );

    // a different dashboard can be selected via the picker
    await getResourceSelectorButton(page).click();

    // The picker opens on "Recent items", where both dashboards are listed;
    // upstream's `findByText` proves the name renders once, and `.first()`
    // guards against a portal duplicate under Playwright's strict mode.
    await entityPickerModal(page)
      .getByText(FIRST_DASHBOARD_NAME, { exact: true })
      .first()
      .click();

    await expect(getResourceSelectorButton(page)).toContainText(
      FIRST_DASHBOARD_NAME,
    );

    await sidebar.getByLabel("Guest", { exact: true }).click();

    // selected dashboard should be shown in the preview
    await waitForDashboardResponse(dashboardResponses, ORDERS_DASHBOARD_ID);

    await expect(
      (await embedPreview(page)).getByText(FIRST_DASHBOARD_NAME, {
        exact: true,
      }),
    ).toBeVisible();

    // Embed preview requests should not have "X-Metabase-Client" header
    // (EMB-945)
    await expect.poll(() => previewEmbedRequests.length).toBeGreaterThan(0);
    expect(
      (await previewEmbedRequests[0].allHeaders())[
        "x-metabase-embedded-preview"
      ],
    ).toBe("true");

    await sidebar.getByText("Next", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=false,experience=dashboard",
    });
  });

  test("can select a recent question to embed", async ({ page, mb }) => {
    // add two questions to activity log
    await logRecent(mb.api, "card", ORDERS_BY_YEAR_QUESTION_ID);
    await logRecent(mb.api, "card", ORDERS_COUNT_QUESTION_ID);

    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await sidebar.getByText("Chart", { exact: true }).click();

    await expect(
      sidebar.getByText("Select a chart to embed", { exact: true }),
    ).toBeVisible();

    // first question should be selected by default
    await expect(getResourceSelectorButton(page)).toContainText(
      FIRST_QUESTION_NAME,
    );

    // a different question can be selected via the picker
    await getResourceSelectorButton(page).click();

    await entityPickerModal(page)
      .getByText(SECOND_QUESTION_NAME, { exact: true })
      .first()
      .click();

    await expect(getResourceSelectorButton(page)).toContainText(
      SECOND_QUESTION_NAME,
    );

    await sidebar.getByText("Next", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=false,experience=chart",
    });

    // selected question should be shown in the preview
    await expect(
      (await embedPreview(page)).getByText(SECOND_QUESTION_NAME, {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can search and select a dashboard", async ({ page, mb }) => {
    const { id: secondDashboardId } = await mb.api.createDashboard({
      name: SECOND_DASHBOARD_NAME,
    });

    const dashboardResponses = captureWizardDashboardResponses(page);

    await visitNewEmbedPage(page);

    await getResourceSelectorButton(page).click();

    const picker = entityPickerModal(page);
    await expect(
      picker.getByText("Select a dashboard", { exact: true }),
    ).toBeVisible();

    // The picker opens on "Recent items" by default. Navigate via the
    // root sidebar to disambiguate from any matching recent entries.
    await entityPickerModalLevel(page, 0)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModalLevel(page, 1)
      .getByText(SECOND_DASHBOARD_NAME, { exact: true })
      .click();

    // button reflects the newly selected dashboard
    await expect(getResourceSelectorButton(page)).toContainText(
      SECOND_DASHBOARD_NAME,
    );

    await waitForDashboardResponse(dashboardResponses, secondDashboardId);

    await expect(
      (await embedPreview(page)).getByText(SECOND_DASHBOARD_NAME, {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can search and select a question", async ({ page }) => {
    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await sidebar.getByText("Chart", { exact: true }).click();
    await getResourceSelectorButton(page).click();

    const picker = entityPickerModal(page);
    await expect(
      picker.getByText("Select a chart", { exact: true }),
    ).toBeVisible();
    await picker.getByText("Our analytics", { exact: true }).first().click();
    await picker.getByText(FIRST_QUESTION_NAME, { exact: true }).click();

    // button reflects the newly selected question
    await expect(getResourceSelectorButton(page)).toContainText(
      FIRST_QUESTION_NAME,
    );

    await sidebar.getByText("Next", { exact: true }).click();

    await expectUnstructuredSnowplowEvent(snowplow, {
      event: "embed_wizard_resource_selection_completed",
      event_detail: "isDefaultResource=false,experience=chart",
    });

    await expect(
      (await embedPreview(page)).getByText(FIRST_QUESTION_NAME, {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can search and select a collection for browser", async ({ page }) => {
    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await sidebar.getByLabel("Metabase account (SSO)", { exact: true }).click();

    await embedModalEnableEmbedding(page);

    await sidebar.getByText("Browser", { exact: true }).click();
    await expect(
      sidebar.getByText("Select initial collection", { exact: true }),
    ).toBeVisible();
    await getResourceSelectorButton(page).click();

    const picker = entityPickerModal(page);
    await expect(
      picker.getByText("Select initial collection", { exact: true }),
    ).toBeVisible();

    // The picker opens on "Recent items" by default. Navigate via the
    // root sidebar to disambiguate from any matching recent entries.
    await entityPickerModalLevel(page, 0)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModalLevel(page, 1)
      .getByText("First collection", { exact: true })
      .click();
    await picker.getByText("Select", { exact: true }).click();

    // button reflects the newly selected collection
    await expect(getResourceSelectorButton(page)).toContainText(
      "First collection",
    );

    // collection is shown in the breadcrumbs and preview
    const preview = await embedPreview(page);
    await expect(
      preview
        .getByTestId("sdk-breadcrumbs")
        .getByText("First collection", { exact: true })
        .first(),
    ).toBeVisible();

    await expect(
      preview.getByText("Second collection", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("recently created dashboards", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("enable-embedding-simple", true);
  });

  // When using x-rays to create your first dashboard in the onboarding
  // flow, user expects that to be the default for the wizard,
  // even if they have never visited that dashboard before.
  test("shows recently created dashboard at the top of the list (EMB-1179)", async ({
    page,
    mb,
  }) => {
    // simulate existing recent activity
    await logRecent(mb.api, "dashboard", ORDERS_DASHBOARD_ID);

    // create a dashboard via x-ray
    await page.goto(`/auto/dashboard/table/${ORDERS_ID}`);
    await expect(
      main(page).getByText("Total transactions", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Save this", exact: true }).click();
    await expect(undoToast(page)).toContainText("Your dashboard was saved");

    await visitNewEmbedPage(page);

    const sidebar = getEmbedSidebar(page);
    await expect(
      sidebar.getByText("Select a dashboard to embed", { exact: true }),
    ).toBeVisible();

    // the recently created x-ray dashboard should be the default selection
    const XRAY_DASHBOARD_NAME = "A look at Orders";
    await expect(getResourceSelectorButton(page)).toContainText(
      XRAY_DASHBOARD_NAME,
      { timeout: 10_000 },
    );
  });
});

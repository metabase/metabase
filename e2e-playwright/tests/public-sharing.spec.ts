/**
 * Playwright port of
 * e2e/test/scenarios/sharing/public-sharing.cy.spec.js
 * ("scenarios > admin > settings > public sharing").
 *
 * Porting notes:
 * - The three `cy.intercept(...).as()` public-listing aliases become a single
 *   `waitForPublicListings(page)` registered before the settings goto and
 *   awaited after (support/public-sharing.ts).
 * - Public-link cells are `ExternalLink`s to the site-url origin, and
 *   `getUrlTarget` returns `_self` for the same origin, so clicking one is a
 *   top-level navigation — the assertions run on the rendered public page
 *   (heading + tab), matching the Cypress original.
 * - `restore()` re-points `site-url` to the worker origin, so the displayed
 *   public URL uses `mb.baseUrl` (the Cypress `location.origin`).
 * - Retried `cy.url().should(...)` checks become `expect.poll(() => page.url())`.
 * - Mantine Switch: click the `role="switch"` input (rule 4), not the label.
 */
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  createQuestion,
  createQuestionAndDashboard,
} from "../support/factories";
import { createAction } from "../support/actions-on-dashboards";
import { setActionsEnabledForDB } from "../support/command-palette";
import { visitDashboardAndCreateTab } from "../support/dashboard-tabs";
import {
  PUBLIC_SHARING_SETTINGS_URL,
  createPublicLink,
  revokePublicLink,
  waitForPublicListings,
} from "../support/public-sharing";

const { ORDERS_ID } = SAMPLE_DATABASE;

const DEFAULT_ACTION_DETAILS = {
  database_id: SAMPLE_DB_ID,
  dataset_query: {
    database: SAMPLE_DB_ID,
    native: {
      query: "UPDATE orders SET quantity = 0 WHERE id = {{order_id}}",
      "template-tags": {
        order_id: {
          "display-name": "Order ID",
          id: "fake-uuid",
          name: "order_id",
          type: "text",
        },
      },
    },
    type: "native",
  },
  name: "Reset order quantity",
  description: "Set order quantity to 0",
  type: "query",
  parameters: [
    {
      id: "fake-uuid",
      hasVariableTemplateTagTarget: true,
      name: "Order ID",
      slug: "order_id",
      type: "string/=",
      target: ["variable", ["template-tag", "fake-uuid"]],
    },
  ],
  visualization_settings: {
    fields: {
      "fake-uuid": {
        id: "fake-uuid",
        fieldType: "string",
        inputType: "string",
        hidden: false,
        order: 999,
        required: true,
        name: "",
        title: "",
        placeholder: "",
        description: "",
      },
    },
    type: "button",
  },
};

test.describe("scenarios > admin > settings > public sharing", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to toggle public sharing", async ({ page }) => {
    await page.goto(PUBLIC_SHARING_SETTINGS_URL);
    const setting = page.getByTestId("enable-public-sharing-setting");
    await expect(setting.getByText("Enabled", { exact: true })).toBeVisible();
    await setting.getByRole("switch").click({ force: true });
    await expect(setting.getByText("Disabled", { exact: true })).toBeVisible();
  });

  test("should see public dashboards", async ({ page, mb }) => {
    const expectedDashboardName = "Public dashboard";
    const expectedDashboardSlug = "public-dashboard";

    const { dashboard_id: dashboardId } = await createQuestionAndDashboard(
      mb.api,
      {
        dashboardDetails: { name: expectedDashboardName },
        questionDetails: {
          name: "Question",
          query: { "source-table": ORDERS_ID },
        },
      },
    );
    const dashboardUuid = await createPublicLink(mb.api, "dashboard", dashboardId);

    await visitDashboardAndCreateTab(page, mb.api, { dashboardId });

    const listingsLoaded = waitForPublicListings(page);
    await page.goto(PUBLIC_SHARING_SETTINGS_URL);
    await listingsLoaded;

    const content = page.getByTestId("admin-layout-content");
    await expect(
      content.getByText("Shared dashboards", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText(expectedDashboardName, { exact: true }),
    ).toBeVisible();

    // Clicking the public URL is a top-level navigation to the public page.
    await page
      .getByRole("link", {
        name: `${mb.baseUrl}/public/dashboard/${dashboardUuid}`,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: expectedDashboardName }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Tab 1" })).toBeVisible();

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    // Clicking the name navigates to the dashboard (the URL may gain a tab id).
    await content.getByText(expectedDashboardName, { exact: true }).click();
    await expect
      .poll(() => page.url())
      .toContain(
        `${mb.baseUrl}/dashboard/${dashboardId}-${expectedDashboardSlug}`,
      );

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    await revokePublicLink(page);
    await expect(
      content.getByText("No dashboards have been publicly shared yet."),
    ).toBeVisible();
  });

  test("should see public questions", async ({ page, mb }) => {
    const expectedQuestionName = "Public question";
    const expectedQuestionSlug = "public-question";

    const { id: questionId } = await createQuestion(mb.api, {
      name: expectedQuestionName,
      query: { "source-table": ORDERS_ID },
    });
    const questionUuid = await createPublicLink(mb.api, "card", questionId);

    const listingsLoaded = waitForPublicListings(page);
    await page.goto(PUBLIC_SHARING_SETTINGS_URL);
    await listingsLoaded;

    const content = page.getByTestId("admin-layout-content");
    await expect(
      content.getByText("Shared questions", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText(expectedQuestionName, { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("link", {
        name: `${mb.baseUrl}/public/question/${questionUuid}`,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: expectedQuestionName }),
    ).toBeVisible();

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    await content.getByText(expectedQuestionName, { exact: true }).click();
    await expect
      .poll(() => page.url())
      .toBe(`${mb.baseUrl}/question/${questionId}-${expectedQuestionSlug}`);

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    await revokePublicLink(page);
    await expect(
      content.getByText("No questions have been publicly shared yet."),
    ).toBeVisible();
  });

  test("should see public actions", async ({ page, mb }) => {
    await setActionsEnabledForDB(mb.api, SAMPLE_DB_ID);
    const expectedActionName = "Public action";

    const { id: modelId } = await createQuestion(mb.api, {
      name: "Model",
      query: { "source-table": ORDERS_ID },
      type: "model",
    });

    const { id: actionId } = await createAction(mb.api, {
      ...DEFAULT_ACTION_DETAILS,
      name: expectedActionName,
      model_id: modelId,
    });

    const actionUuid = await createPublicLink(mb.api, "action", actionId);

    const listingsLoaded = waitForPublicListings(page);
    await page.goto(PUBLIC_SHARING_SETTINGS_URL);
    await listingsLoaded;

    const content = page.getByTestId("admin-layout-content");
    await expect(
      content.getByText("Shared action forms", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText(expectedActionName, { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("link", {
        name: `${mb.baseUrl}/public/action/${actionUuid}`,
      })
      .click();
    await expect(
      page.getByRole("heading", { name: expectedActionName }),
    ).toBeVisible();

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    await content.getByText(expectedActionName, { exact: true }).click();
    await expect
      .poll(() => page.url())
      .toBe(
        `${mb.baseUrl}/model/${modelId}/detail/actions/${actionId}`,
      );
    await expect(
      page.getByRole("dialog").getByText(expectedActionName, { exact: true }),
    ).toBeVisible();

    await page.goto(PUBLIC_SHARING_SETTINGS_URL);

    await revokePublicLink(page);
    await expect(
      content.getByText("No actions have been publicly shared yet."),
    ).toBeVisible();
  });
});

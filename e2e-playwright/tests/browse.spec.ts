/**
 * Playwright port of e2e/test/scenarios/onboarding/home/browse.cy.spec.ts
 *
 * The Browse section: Databases / Models / Metrics tabs, the tables list,
 * navigating into a table or a model, the clean /table/:slug URL and its
 * /question fallback on edit, browse-page x-rays, the "Learn about our data"
 * reference page, error states when /api/search fails, the EE verified-models
 * filter, plus the two repros (field descriptions in data reference #37907 and
 * the table-name tooltip overflow #74433).
 *
 * Port notes:
 * - Snowplow assertions are real, backed by the per-slot collector via
 *   ../support/snowplow; the real UI actions they guard are kept too.
 * - findByText / findByRole(name: string) are exact matches (rule 1).
 * - `cy.intercept(...).as` + `cy.wait` become page.waitForResponse registered
 *   before the triggering action (rule 2).
 * - The window.open spy (cy.stub(win, "open")) → spyOnWindowOpen /
 *   getWindowOpenCalls (imported read-only from support/metrics-browse.ts).
 * - The EE describe is gated on the pro-self-hosted token (the jar activates it).
 * - New helpers live in support/browse.ts; everything else is imported read-only.
 */
import type { Page } from "@playwright/test";

import { resolveToken } from "../support/api";
import {
  verifiedFilterToggleButton,
  recentModel,
  modelHeading,
  modelRow,
  modelsTable,
  toggleVerificationFilter,
  unverifyModel,
  verifyModel,
} from "../support/browse";
import { browseDatabases } from "../support/question-settings";
import { createQuestion } from "../support/factories";
import { expect, test } from "../support/fixtures";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import {
  getWindowOpenCalls,
  spyOnWindowOpen,
} from "../support/metrics-browse";
import { metaClick } from "../support/notebook-link-to-data-source";
import { miniPicker, tableHeaderClick } from "../support/notebook";
import { tableInteractive } from "../support/models";
import { tooltip } from "../support/charts";
import { ORDERS_MODEL_ID } from "../support/organization";
import {
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
  SAMPLE_DB_ID,
} from "../support/sample-data";
import { icon, main, modal, navigationSidebar, popover, visitQuestion } from "../support/ui";

const { PRODUCTS_ID, ORDERS_ID } = SAMPLE_DATABASE;

/** Port of the beforeEach `cy.intercept("GET", "/api/search*", 400)`. */
async function failSearchEndpoint(page: Page) {
  await page.route(
    (url) => new URL(url.href).pathname === "/api/search",
    (route) => route.fulfill({ status: 400, body: "" }),
  );
}

test.describe("browse > models", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("correctly displays models empty states", async ({ mb, page }) => {
    // Models explanation banner is visible initially but can be dismissed.
    await page.goto("/browse/models");
    const banner = page
      .getByRole("complementary")
      .filter({
        hasText:
          "Create models to clean up and combine tables to make your data easier to explore",
      });
    await expect(banner).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(banner).toHaveCount(0);

    // Removing the last model from the page displays an empty state.
    await expect(page.getByTestId("model-name")).toHaveCount(1); // sanity check
    await mb.api.put(`/api/card/${ORDERS_MODEL_ID}`, { archived: true });
    await page.reload();
    await expect(page.locator("iframe").first()).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Create models to clean up and combine tables to make your data easier to explore",
        exact: true,
      }),
    ).toBeVisible();
  });

  test("can browse to a model in a new tab by meta-clicking", async ({
    page,
  }) => {
    // Prevent opening a new window/tab and spy on window.open.
    await spyOnWindowOpen(page);
    await page.goto("/browse/models");
    await metaClick(
      page.getByRole("heading", { name: "Orders Model", exact: true }),
    );

    await expect.poll(() => getWindowOpenCalls(page)).toHaveLength(1);
    const [call] = await getWindowOpenCalls(page);
    expect(call).toEqual([
      `/model/${ORDERS_MODEL_ID}-orders-model`,
      "_blank",
    ]);
  });
});

test.describe("scenarios > browse", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("can browse to a model", async ({ mb, page }) => {
    await page.goto("/");
    await navigationSidebar(page).getByLabel("Browse models").click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/browse/models");
    await page.getByRole("heading", { name: "Orders Model", exact: true }).click();
    await expect
      .poll(() => page.url())
      .toContain(`/model/${ORDERS_MODEL_ID}-`);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "browse_data_model_clicked",
      model_id: ORDERS_MODEL_ID,
    });
  });

  test("can browse to a table in a database", async ({ mb, page }) => {
    await page.goto("/");
    await browseDatabases(page).click();
    await page
      .getByRole("heading", { name: "Sample Database", exact: true })
      .click();
    await page.getByRole("heading", { name: "Products", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /Summarize/ }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Sample Database/ }).click();
    await expectUnstructuredSnowplowEvent(mb, {
      event: "browse_data_table_clicked",
      table_id: PRODUCTS_ID,
    });
  });

  test("opens a table at a clean /table/:slug URL that falls back to /question on edit", async ({
    page,
  }) => {
    await page.goto("/");
    await browseDatabases(page).click();
    await page
      .getByRole("heading", { name: "Sample Database", exact: true })
      .click();
    await page.getByRole("heading", { name: "Products", exact: true }).click();

    // A pristine table view keeps the canonical /table/:slug URL.
    await expect(
      page.getByRole("button", { name: /Summarize/ }),
    ).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/table/${PRODUCTS_ID}-products`);

    // The clean URL survives a reload.
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Summarize/ }),
    ).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe(`/table/${PRODUCTS_ID}-products`);

    // Editing the question falls back to the ad-hoc /question#hash form.
    await tableHeaderClick(page, "Category");
    await popover(page)
      .getByTestId("click-actions-sort-control-sort.ascending")
      .click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/question");
    await expect.poll(() => new URL(page.url()).hash).not.toBe("");
  });

  test("can generate x-ray dashboard from a browse page", async ({ mb, page }) => {
    await page.goto(`/browse/databases/${SAMPLE_DB_ID}`);

    const schemas = page.getByTestId("browse-schemas");
    const peopleLink = schemas
      .getByRole("link")
      .filter({ hasText: "People" })
      .first();
    await expect(peopleLink).toBeVisible();
    await peopleLink.hover();
    await schemas
      .getByLabel("X-ray this table")
      .filter({ visible: true })
      .first()
      .click();

    await expectUnstructuredSnowplowEvent(mb, {
      event: "x-ray_clicked",
      event_detail: "table",
      triggered_from: "browse_database",
    });
  });

  test("tracks when a new model creation is initiated", async ({ mb, page }) => {
    await page.goto("/browse/models");
    const createModel = page
      .getByTestId("browse-models-header")
      .getByLabel("Create a new model");
    await expect(createModel).toBeVisible();
    await createModel.click();
    await expect.poll(() => new URL(page.url()).pathname).toBe("/model/new");
    await expectUnstructuredSnowplowEvent(mb, {
      event: "plus_button_clicked",
      triggered_from: "model",
    });
  });

  test("tracks when a new metric creation is initiated", async ({ mb, page }) => {
    await page.goto("/browse/metrics");
    const createMetric = page
      .getByTestId("browse-metrics-header")
      .getByLabel("Create a new metric");
    await expect(createMetric).toBeVisible();
    await createMetric.click();
    await expect(miniPicker(page)).toBeVisible();

    await expectUnstructuredSnowplowEvent(mb, {
      event: "plus_button_clicked",
      triggered_from: "metric",
    });
  });

  test("browsing to a database only triggers a request for schemas for that specific database", async ({
    page,
  }) => {
    let otherSchemasCalls = 0;
    page.on("response", (response) => {
      const pathname = new URL(response.url()).pathname;
      if (/\/api\/database\/(?!1\b)\d+\/schemas/.test(pathname)) {
        otherSchemasCalls += 1;
      }
    });

    const schemasForSampleDatabase = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
        `/api/database/${SAMPLE_DB_ID}/schemas`,
    );

    await page.goto("/");
    await browseDatabases(page).click();
    await page.getByRole("link", { name: /Sample Database/ }).click();
    await schemasForSampleDatabase;
    expect(otherSchemasCalls).toBe(0);
  });

  test("can visit 'Learn about our data' page", async ({ mb, page }) => {
    await page.goto("/");
    await browseDatabases(page).click();
    await page.getByRole("link", { name: /Learn about our data/ }).click();
    await expect
      .poll(() => new URL(page.url()).pathname)
      .toBe("/reference/databases");
    await expectUnstructuredSnowplowEvent(mb, {
      event: "learn_about_our_data_clicked",
    });
    await page.goBack();
    await page
      .getByRole("heading", { name: "Sample Database", exact: true })
      .click();
    await page.getByRole("heading", { name: "Products", exact: true }).click();
    await expect(
      page.getByRole("gridcell", { name: "Rustic Paper Wallet" }),
    ).toBeVisible();
  });

  test("on an open-source instance, the Browse models page has no controls for setting filters", async ({
    page,
  }) => {
    await page.goto("/");
    await navigationSidebar(page).getByLabel("Browse models").click();
    await expect(verifiedFilterToggleButton(page)).toHaveCount(0);
  });

  test("The Browse models page shows an error message if the search endpoint throws an error", async ({
    page,
  }) => {
    await page.goto("/");
    await failSearchEndpoint(page);
    await navigationSidebar(page).getByLabel("Browse models").click();
    await expect(
      page.getByLabel("Models", { exact: true }).getByText("An error occurred", {
        exact: true,
      }),
    ).toHaveCount(2);
  });

  test("The Browse metrics page shows an error message if the search endpoint throws an error", async ({
    page,
  }) => {
    await page.goto("/");
    await failSearchEndpoint(page);
    await navigationSidebar(page).getByLabel("Browse metrics").click();
    await expect(
      page
        .getByLabel("Metrics", { exact: true })
        .getByText("An error occurred", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("scenarios > browse (EE)", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires the pro-self-hosted token and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
    await mb.api.activateToken("pro-self-hosted");
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  async function browseModels(page: Page) {
    await page.goto("/");
    await navigationSidebar(page)
      .getByRole("listitem", { name: "Browse models" })
      .click();
  }

  test("/browse/models allows models to be filtered, on an enterprise instance", async ({
    mb,
    page,
  }) => {
    // Create several models — enough that we can see recently viewed models.
    for (let i = 0; i < 10; i++) {
      await createQuestion(mb.api, {
        name: `Model ${i}`,
        query: {
          "source-table": PRODUCTS_ID,
          limit: 10,
        },
        type: "model",
      });
    }

    await browseModels(page);

    // Cells for both models exist in the table.
    await expect(modelHeading(page, "Model 1")).toBeVisible();
    await expect(modelHeading(page, "Model 2")).toBeVisible();

    // In the Browse models table, model 1 is marked as unverified.
    await expect(icon(modelRow(page, /Model 1/i), "model")).toBeVisible();
    await expect(
      icon(modelRow(page, /Model 1/i), "model_with_badge"),
    ).toHaveCount(0);
    // model 2 is marked as unverified.
    await expect(icon(modelRow(page, /Model 2/i), "model")).toBeVisible();
    await expect(
      icon(modelRow(page, /Model 2/i), "model_with_badge"),
    ).toHaveCount(0);

    // There are no verified models, so the filter toggle is not visible.
    await expect(verifiedFilterToggleButton(page)).toHaveCount(0);

    // Verify Model 2.
    await page.getByRole("heading", { name: "Model 2", exact: true }).click();
    await verifyModel(page);

    await browseModels(page);

    // Filter on verified models is enabled by default.
    await expect(
      page
        .getByTestId("browse-models-header")
        .getByRole("switch", { name: /Show unverified models, too/i }),
    ).toBeVisible();

    // Model 1 does not appear in the table, since it's not verified.
    await expect(modelHeading(page, "Model 1")).toHaveCount(0);

    // Model 2 now appears in the table as verified.
    await expect(modelHeading(page, "Model 2")).toBeVisible();
    await expect(icon(modelRow(page, /Model 2/i), "model")).toHaveCount(0);
    await expect(
      icon(modelRow(page, /Model 2/i), "model_with_badge"),
    ).toBeVisible();

    // The filter toggle is now visible.
    await expect(verifiedFilterToggleButton(page)).toBeVisible();

    // Unverify Model 2.
    await page.getByRole("heading", { name: "Model 2", exact: true }).click();
    await unverifyModel(page);

    await browseModels(page);

    // Visit Model 1.
    await page.getByRole("heading", { name: "Model 1", exact: true }).click();

    // Make sure data is loaded.
    await expect(
      tableInteractive(page).getByText("Rustic Paper Wallet"),
    ).toBeVisible();

    await browseModels(page);

    // The filter toggle is not visible.
    await expect(verifiedFilterToggleButton(page)).toHaveCount(0);

    // The verified filter, though still active, is not applied if there are no
    // verified models. Both models are in the table — no filter is applied here.
    await expect(modelHeading(page, "Model 2")).toBeVisible();
    await expect(modelHeading(page, "Model 1")).toBeVisible();
    // Both models are in the recents grid — no filter is applied here.
    await expect(recentModel(page, "Model 2")).toBeVisible();
    await expect(recentModel(page, "Model 1")).toBeVisible();

    // Verify Model 2.
    await modelsTable(page).getByText("Model 2", { exact: true }).click();
    await verifyModel(page);

    await browseModels(page);

    // There are no icons in the table representing unverified models.
    await expect(icon(modelsTable(page), "model")).toHaveCount(0);

    // Show all models.
    await toggleVerificationFilter(page);

    // Both models now both exist in the table.
    await expect(modelHeading(page, "Model 1")).toBeVisible();
    await expect(modelHeading(page, "Model 2")).toBeVisible();

    // Model 1 appears as unverified.
    await expect(icon(modelRow(page, /Model 1/i), "model")).toBeVisible();
    await expect(
      icon(modelRow(page, /Model 1/i), "model_with_badge"),
    ).toHaveCount(0);
  });
});

test.describe("issue 37907", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("allows to change field descriptions in data reference page (metabase#37907)", async ({
    page,
  }) => {
    await page.goto("/");
    await browseDatabases(page).click();
    await page.getByRole("link", { name: /Learn about our data/ }).click();
    await page.getByTestId("data-reference-list-item").click();
    await page
      .getByRole("link", { name: /Tables in Sample Database/ })
      .click();
    await page
      .getByTestId("data-reference-list-item")
      .getByText("Orders", { exact: true })
      .click();
    await page.getByRole("link", { name: /Fields in this table/ }).click();
    await page.getByRole("button", { name: /Edit/ }).click();

    const descriptions = page.getByPlaceholder("No column description yet", {
      exact: true,
    });
    await descriptions.nth(0).fill("My ID column");
    const totalDescription = descriptions.nth(5);
    await totalDescription.focus();
    await totalDescription.press("End");
    await totalDescription.pressSequentially(" Updated.");

    const fieldUpdate1 = waitForFieldUpdate(page);
    const fieldUpdate2 = waitForFieldUpdate(page);
    await page.getByRole("button", { name: /Save/ }).click();
    await Promise.all([fieldUpdate1, fieldUpdate2]);

    await expect(
      main(page).getByText("My ID column", { exact: true }),
    ).toBeVisible();
    await expect(
      main(page).getByText("The total billed amount. Updated.", {
        exact: true,
      }),
    ).toBeVisible();
    const discount = main(page).getByText("Discount amount.", { exact: true });
    await discount.scrollIntoViewIfNeeded();
    await expect(discount).toBeVisible();

    await visitQuestion(page, ORDERS_QUESTION_ID);

    await tableInteractive(page).getByText("ID", { exact: true }).first().hover();
    await expect(popover(page)).toContainText("My ID column");

    await tableInteractive(page)
      .getByText("Total", { exact: true })
      .first()
      .hover();
    await expect(popover(page)).toContainText(
      "The total billed amount. Updated.",
    );

    await tableInteractive(page)
      .getByText("Discount ($)", { exact: true })
      .first()
      .hover();
    await expect(popover(page)).toContainText("Discount amount.");
  });
});

test.describe("issue 74433", () => {
  const LONG_TABLE_NAME =
    "thisisaverylongtablenamewithoutspacesthatshouldoverflowthetooltipboxbecausetherearenospacesforbreakingxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.put(`/api/table/${ORDERS_ID}`, {
      display_name: LONG_TABLE_NAME,
    });
  });

  test("table-name tooltip in Browse Databases should not overflow when the name has no spaces (metabase#74433)", async ({
    page,
  }) => {
    await page.goto(`/browse/databases/${SAMPLE_DB_ID}`);

    // Browse cards wrap the <Title> in an <Ellipsified> component, so hover the
    // parent to trigger the tooltip.
    await page
      .getByRole("heading", { name: LONG_TABLE_NAME, exact: true })
      .locator("..")
      .hover();

    const box = tooltip(page).first();
    await expect(box).toBeVisible();
    const [scrollWidth, clientWidth] = await box.evaluate((el) => [
      el.scrollWidth,
      el.clientWidth,
    ]);
    expect(scrollWidth, "tooltip content fits within its box").toBeLessThanOrEqual(
      clientWidth,
    );
  });
});

/** Port of the @fieldUpdate intercept: PUT /api/field/*. */
function waitForFieldUpdate(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/field\/\d+$/.test(new URL(response.url()).pathname),
  );
}

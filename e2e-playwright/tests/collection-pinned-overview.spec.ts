/**
 * Playwright port of
 * e2e/test/scenarios/collections/collection-pinned-overview.cy.spec.js
 *
 * The Cypress beforeEach registered two intercepts (`@getPinnedItems`,
 * `@getCardQuery`); here the equivalent waitForResponse promises are
 * registered per-test, immediately before the action that triggers them.
 */
import type { Page } from "@playwright/test";

import {
  dragAndDrop,
  getPinnedSection,
  openPinnedItemMenu,
  openUnpinnedItemMenu,
  waitForCardQuery,
  waitForPinnedItems,
} from "../support/collections";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { ORDERS_COUNT_QUESTION_ID } from "../support/organization";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SAMPLE_DATABASE,
} from "../support/sample-data";
import { createNativeQuestion } from "../support/sharing";
import { collectionTable, popover } from "../support/ui";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";
const MODEL_NAME = "Orders";

const PIVOT_QUESTION_DETAILS = {
  name: "Pivot table",
  display: "pivot",
  query: {
    "source-table": ORDERS_ID,
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    aggregation: [["count"]],
  },
  visualization_settings: {
    "table.pivot_column": "CREATED_AT",
    "table.cell_column": "count",
    "pivot_table.column_split": {
      rows: ["CREATED_AT"],
      columns: [],
      values: ["count"],
    },
  },
};

const SQL_QUESTION_DETAILS_REQUIRED_PARAMETER = {
  name: "SQL with parameters",
  display: "scalar",
  native: {
    "template-tags": {
      filter: {
        id: "ce8f111c-24c4-6823-b34f-f704404572f1",
        name: "filter",
        "display-name": "Filter",
        type: "text",
        required: true,
      },
    },
    query: "select {{filter}}",
  },
};

const SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE = {
  name: "SQL with parameters",
  display: "scalar",
  native: {
    "template-tags": {
      filter: {
        type: "dimension",
        name: "filter",
        id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
        "display-name": "date",
        default: "1999-02-26~2024-02-26",
        dimension: ["field", PEOPLE.BIRTH_DATE, null],
        "widget-type": "date/range",
      },
    },
    query: "select count(*) from people where {{filter}}",
  },
};

const openRootCollection = async (page: Page) => {
  const pinnedItems = waitForPinnedItems(page);
  await page.goto("/collection/root");
  await pinnedItems;
};

test.describe("scenarios > collection pinned items overview", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be able to pin a dashboard", async ({ page }) => {
    await openRootCollection(page);
    await openUnpinnedItemMenu(page, DASHBOARD_NAME);
    const pinnedItems = waitForPinnedItems(page);
    await popover(page).getByText("Pin this", { exact: true }).click();
    await pinnedItems;

    const pinnedSection = getPinnedSection(page);
    await expect(icon(pinnedSection, "dashboard").first()).toBeVisible(); // two icons per pinned card
    await expect(
      pinnedSection.getByText("A dashboard", { exact: true }),
    ).toBeVisible();
    await pinnedSection.getByText(DASHBOARD_NAME, { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/${ORDERS_DASHBOARD_ID}`),
    );
  });

  test("should be able to pin a question", async ({ page }) => {
    await openRootCollection(page);
    await openUnpinnedItemMenu(page, QUESTION_NAME);
    const pinnedItems = waitForPinnedItems(page);
    const cardQuery = waitForCardQuery(page);
    await popover(page).getByText("Pin this", { exact: true }).click();
    await Promise.all([pinnedItems, cardQuery]);

    const pinnedSection = getPinnedSection(page);
    await expect(
      pinnedSection.getByText("18,760", { exact: true }),
    ).toBeVisible();
    await pinnedSection.getByText(QUESTION_NAME, { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/question/${ORDERS_COUNT_QUESTION_ID}`),
    );
  });

  test("should be able to pin a pivot table", async ({ page, mb }) => {
    const { id } = await mb.api.createQuestion(PIVOT_QUESTION_DETAILS);
    await mb.api.put(`/api/card/${id}`, { collection_position: 1 });

    const cardQuery = waitForCardQuery(page);
    await openRootCollection(page);
    await cardQuery;

    const pinnedSection = getPinnedSection(page);
    await expect(
      pinnedSection.getByText(PIVOT_QUESTION_DETAILS.name, { exact: true }),
    ).toBeVisible();
    await expect(
      pinnedSection.getByText("Created At: Month", { exact: true }),
    ).toBeVisible();
    await expect(
      pinnedSection.getByText("Count", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to pin a model", async ({ page, mb }) => {
    await mb.api.put(`/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });

    await openRootCollection(page);
    await openUnpinnedItemMenu(page, MODEL_NAME);
    const pinnedItems = waitForPinnedItems(page);
    await popover(page).getByText("Pin this", { exact: true }).click();
    await pinnedItems;

    const pinnedSection = getPinnedSection(page);
    await expect(icon(pinnedSection, "model").first()).toBeVisible(); // two icons per pinned card
    await expect(
      pinnedSection.getByText(MODEL_NAME, { exact: true }),
    ).toBeVisible();
    await pinnedSection.getByText("A model", { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/model/${ORDERS_QUESTION_ID}`));
  });

  test("should be able to unpin a pinned dashboard", async ({ page, mb }) => {
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    await openRootCollection(page);
    await openPinnedItemMenu(page, DASHBOARD_NAME);
    const pinnedItems = waitForPinnedItems(page);
    await popover(page).getByText("Unpin", { exact: true }).click();
    await pinnedItems;

    await expect(getPinnedSection(page)).toHaveCount(0);
  });

  test("should be able to move a pinned dashboard", async ({ page, mb }) => {
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    await openRootCollection(page);
    await openPinnedItemMenu(page, DASHBOARD_NAME);
    await popover(page).getByText("Move", { exact: true }).click();

    await expect(
      page.getByText(`Move "${DASHBOARD_NAME}"?`, { exact: true }),
    ).toBeVisible();
  });

  test("should be able to duplicate a pinned dashboard", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    await openRootCollection(page);
    await openPinnedItemMenu(page, DASHBOARD_NAME);
    await popover(page).getByText("Duplicate", { exact: true }).click();

    await expect(
      page.getByText(`Duplicate "${DASHBOARD_NAME}" and its questions`, {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should be able to archive a pinned dashboard", async ({ page, mb }) => {
    await mb.api.put(`/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    await openRootCollection(page);
    await openPinnedItemMenu(page, DASHBOARD_NAME);
    const pinnedItems = waitForPinnedItems(page);
    await popover(page).getByText("Move to trash", { exact: true }).click();
    await pinnedItems;

    await expect(getPinnedSection(page)).toHaveCount(0);
    await expect(page.getByText(DASHBOARD_NAME, { exact: true })).toHaveCount(
      0,
    );
  });

  test("should be able to hide the visualization for a pinned question", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
    });

    await openRootCollection(page);
    // wait for data to be loaded and displayed
    await expect(
      getPinnedSection(page).getByText("18,760", { exact: true }),
    ).toBeVisible();
    await openPinnedItemMenu(page, QUESTION_NAME);
    const pinnedItems = waitForPinnedItems(page);
    await popover(page)
      .getByText("Don’t show visualization", { exact: true })
      .click();
    await pinnedItems;

    const pinnedSection = getPinnedSection(page);
    await expect(pinnedSection.getByText("18,760", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      pinnedSection.getByText("A question", { exact: true }),
    ).toBeVisible();
    await pinnedSection.getByText(QUESTION_NAME, { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/question/${ORDERS_COUNT_QUESTION_ID}`),
    );
  });

  test("should be able to show the visualization for a pinned question", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
      collection_preview: false,
    });

    await openRootCollection(page);
    await openPinnedItemMenu(page, QUESTION_NAME);
    const pinnedItems = waitForPinnedItems(page);
    const cardQuery = waitForCardQuery(page);
    await popover(page)
      .getByText("Show visualization", { exact: true })
      .click();
    await Promise.all([pinnedItems, cardQuery]);

    const pinnedSection = getPinnedSection(page);
    await expect(
      pinnedSection.getByText(QUESTION_NAME, { exact: true }),
    ).toBeVisible();
    await expect(
      pinnedSection.getByText("18,760", { exact: true }),
    ).toBeVisible();
  });

  test.describe("native questions", () => {
    test("should automatically hide the visualization for pinned native questions with missing required parameters", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(
        mb.api,
        SQL_QUESTION_DETAILS_REQUIRED_PARAMETER,
      );
      await mb.api.put(`/api/card/${id}`, { collection_position: 1 });

      await openRootCollection(page);
      const pinnedSection = getPinnedSection(page);
      // NOTE: the Cypress spec referenced SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE
      // here — a copy-paste slip that only worked because both questions share
      // the name "SQL with parameters". Asserting on the created question.
      await expect(
        pinnedSection.getByText(SQL_QUESTION_DETAILS_REQUIRED_PARAMETER.name, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        pinnedSection.getByText("A question", { exact: true }),
      ).toBeVisible();
    });

    test("should apply default value of variable for pinned native questions (metabase#37831)", async ({
      page,
      mb,
    }) => {
      const { id } = await createNativeQuestion(
        mb.api,
        SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE,
      );
      await mb.api.put(`/api/card/${id}`, { collection_position: 1 });

      await openRootCollection(page);
      const pinnedSection = getPinnedSection(page);
      await expect(
        pinnedSection.getByText(SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE.name, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(pinnedSection.getByTestId("scalar-value")).toHaveText("68");
    });
  });

  test("should be able to pin a visualization by dragging it up", async ({
    page,
    mb,
  }) => {
    await mb.api.put(`/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
      collection_preview: false,
    });
    await openRootCollection(page);

    const draggingViz = collectionTable(page).getByText(
      "Orders, Count, Grouped by Created At (year)",
      { exact: true },
    );
    const pinnedItems = page.getByTestId("pinned-items");

    // this test can give us some degree of confidence, but its effectiveness is limited
    // because we are manually firing events on the correct elements. It doesn't seem that there's
    // a way to actually simulate the raw user interaction of dragging a certain distance in cypress.
    // this will not guarantee that the drag and drop functionality will work in the real world, e.g
    // when our various drag + drop libraries start interfering with events on one another.
    // for example, this test would not have caught https://github.com/metabase/metabase/issues/30614
    // even libraries like https://github.com/dmtrKovalenko/cypress-real-events rely on firing events
    // on specific elements rather than truly simulating mouse movements across the screen
    await dragAndDrop(page, draggingViz, pinnedItems);

    await expect(
      collectionTable(page).getByText(
        "Orders, Count, Grouped by Created At (year)",
        { exact: true },
      ),
    ).toHaveCount(0);

    await expect(
      page
        .getByTestId("pinned-items")
        .getByText("Orders, Count, Grouped by Created At (year)", {
          exact: true,
        }),
    ).toBeVisible();
  });
});

/**
 * Ports of e2e/test/scenarios/dashboard-filters-2/shared/dashboard-filters-query-stages.ts,
 * reduced to the surface the dashboard-filters-2-stage-4 spec (Q8: two-stage
 * query with join, custom column, 2 aggregations, 2 breakouts) exercises.
 *
 * Abbreviations used for card indexes in this suite:
 *  qbq = question-based question, mbq = model-based question,
 *  qbm = question-based model,   mbm = model-based model.
 *
 * Porting notes:
 * - The Cypress helper aliases (@dataset / @dashboardData / @publicDashboardData
 *   / @embeddedDashboardData) become waitForResponse predicates registered
 *   BEFORE the triggering action (rule 2). `waitForDashboardData(page, n)`,
 *   `waitForPublicDashboardData`, and `waitForEmbeddedDashboardData` each resolve
 *   after `n` matching responses.
 * - Cypress `getFilter(name)` clicks the parameter pill while editing; the setup
 *   functions register the two dashcard-query waits internally where the original
 *   ended with `cy.wait(["@dashboardData", "@dashboardData"])`.
 * - `verifyPopoverMappingOptions` mirrors the upstream flat walk over the
 *   `[data-element-id=list-section]` rows (both section headers and column rows
 *   carry that attribute); all rows are in the DOM at once (the list is
 *   scroll-, not unmount-, virtualized), so nth-indexing + the total-count
 *   assertion port straight across.
 * - `findByText`/`findByLabelText`/`findByRole(name)`/`cy.button` string args are
 *   testing-library exact → `{ exact: true }` here (rule 1).
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { tooltip } from "./charts";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "./dashboard";
import type { Card, Dashboard } from "./factories";
import { createDashboardWithTabs, createQuestion } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";
import { icon, popover, visitDashboard } from "./ui";
import { expect } from "./fixtures";

type MetabaseHarness = { api: MetabaseApi };

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

type StructuredQuery = Record<string, unknown>;
type FieldRef = [string, string | number, Record<string, unknown>];

const CARD_HEIGHT = 4;
const CARD_WIDTH = 12;

const DATE_PARAMETER = {
  name: "Date",
  slug: "date",
  id: "717a5624",
  type: "date/all-options",
  sectionId: "date",
};

const TEXT_PARAMETER = {
  name: "Text",
  slug: "text",
  id: "76817b51",
  type: "string/=",
  sectionId: "string",
};

const NUMBER_PARAMETER = {
  name: "Number",
  slug: "number",
  id: "f5944ad9",
  type: "number/=",
  sectionId: "number",
};

const TOTAL_FIELD: FieldRef = ["field", "TOTAL", { "base-type": "type/Float" }];
const TAX_FIELD: FieldRef = ["field", "TAX", { "base-type": "type/Float" }];
const PRODUCT_ID_FIELD: FieldRef = [
  "field",
  "PRODUCT_ID",
  { "base-type": "type/Float" },
];

export const ORDERS_DATE_COLUMNS = ["Created At"];
export const ORDERS_NUMBER_COLUMNS = [
  "Subtotal",
  "Tax",
  "Total",
  "Discount",
  "Quantity",
];

export const PRODUCTS_DATE_COLUMNS = ["Created At"];
export const PRODUCTS_TEXT_COLUMNS = ["Ean", "Title", "Category", "Vendor"];
export const PRODUCTS_NUMBER_COLUMNS = ["Price", "Rating"];

export const PEOPLE_DATE_COLUMNS = ["Birth Date", "Created At"];
export const PEOPLE_TEXT_COLUMNS = [
  "Address",
  "Email",
  "Password",
  "Name",
  "Source",
];
export const PEOPLE_NUMBER_COLUMNS = ["Longitude", "Latitude"];

export const REVIEWS_DATE_COLUMNS = ["Created At"];
export const REVIEWS_TEXT_COLUMNS = ["Reviewer", "Body"];
export const REVIEWS_NUMBER_COLUMNS = ["Rating"];

export const QUESTION_BASED_QUESTION_INDEX = 0;
export const MODEL_BASED_QUESTION_INDEX = 1;
export const QUESTION_BASED_MODEL_INDEX = 2;
export const MODEL_BASED_MODEL_INDEX = 3;

export type BaseQuestions = {
  ordersQuestion: Card;
  baseQuestion: Card;
  baseModel: Card;
};

export async function createBaseQuestions(
  api: MetabaseApi,
): Promise<BaseQuestions> {
  const ordersQuestion = await createQuestion(api, {
    type: "question",
    name: "Q0 Orders",
    description: "Question based on a database table",
    query: { "source-table": ORDERS_ID },
  });

  const baseQuestion = await createQuestion(api, {
    type: "question",
    name: "Base Orders Question",
    query: { "source-table": `card__${ordersQuestion.id}` },
  });

  const baseModel = await createQuestion(api, {
    type: "model",
    name: "Base Orders Model",
    query: { "source-table": `card__${ordersQuestion.id}` },
  });

  return { ordersQuestion, baseQuestion, baseModel };
}

// Q1 - join, custom column, no aggregations, no breakouts
export function createQ1Query(source: Card): StructuredQuery {
  return {
    "source-table": `card__${source.id}`,
    expressions: {
      Net: ["-", TOTAL_FIELD, TAX_FIELD],
    },
    joins: [
      {
        fields: "all",
        strategy: "left-join",
        alias: "Reviews - Product",
        condition: [
          "=",
          PRODUCT_ID_FIELD,
          [
            "field",
            "PRODUCT_ID",
            {
              "base-type": "type/Integer",
              "join-alias": "Reviews - Product",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
  };
}

// Q3 - join, custom column, no aggregations, 3 breakouts
export function createQ3Query(source: Card): StructuredQuery {
  return {
    ...createQ1Query(source),
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
      [
        "field",
        PRODUCTS.CATEGORY,
        { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
      ],
      [
        "field",
        PEOPLE.CREATED_AT,
        {
          "base-type": "type/DateTime",
          "temporal-unit": "year",
          "source-field": ORDERS.USER_ID,
        },
      ],
    ],
  };
}

// Q4 - join, custom column, 2 aggregations, 2 breakouts
export function createQ4Query(source: Card): StructuredQuery {
  return {
    ...createQ3Query(source),
    aggregation: [["count"], ["sum", TOTAL_FIELD]],
  };
}

// Q5 - Q4 + 2nd stage with join, custom column, no aggregations, no breakouts
export function createQ5Query(source: Card): StructuredQuery {
  return {
    "source-query": createQ4Query(source),
    expressions: {
      "5 * Count": [
        "*",
        5,
        ["field", "count", { "base-type": "type/Integer" }],
      ],
    },
    joins: [
      {
        strategy: "left-join",
        alias: "Reviews - Created At: Month",
        condition: [
          "=",
          [
            "field",
            "CREATED_AT",
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
          [
            "field",
            REVIEWS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
              "join-alias": "Reviews - Created At: Month",
            },
          ],
        ],
        "source-table": REVIEWS_ID,
      },
    ],
  };
}

// Q7 - Q4 + 2nd stage with join, custom column, no aggregations, 2 breakouts
export function createQ7Query(source: Card): StructuredQuery {
  return {
    ...createQ5Query(source),
    breakout: [
      [
        "field",
        REVIEWS.REVIEWER,
        { "base-type": "type/Text", "join-alias": "Reviews - Created At: Month" },
      ],
      [
        "field",
        "PRODUCTS__via__PRODUCT_ID__CATEGORY",
        { "base-type": "type/Text" },
      ],
    ],
  };
}

// Q8 - Q4 + 2nd stage with join, custom column, 2 aggregations, 2 breakouts
export function createQ8Query(source: Card): StructuredQuery {
  return {
    ...createQ7Query(source),
    aggregation: [
      ["count"],
      [
        "sum",
        [
          "field",
          REVIEWS.RATING,
          {
            "base-type": "type/Integer",
            "join-alias": "Reviews - Created At: Month",
          },
        ],
      ],
    ],
  };
}

type CreateQuery = (source: Card) => StructuredQuery;

export async function createAndVisitDashboardWithCardMatrix(
  page: Page,
  mb: MetabaseHarness,
  createQueryFromCard: CreateQuery,
  { baseQuestion, baseModel }: BaseQuestions,
): Promise<number> {
  const qbq = await createQuestion(mb.api, {
    type: "question",
    query: createQueryFromCard(baseQuestion),
    name: "Question-based Question",
  });
  const mbq = await createQuestion(mb.api, {
    type: "question",
    query: createQueryFromCard(baseModel),
    name: "Model-based Question",
  });
  const qbm = await createQuestion(mb.api, {
    type: "model",
    name: "Question-based Model",
    query: createQueryFromCard(baseQuestion),
  });
  const mbm = await createQuestion(mb.api, {
    type: "model",
    name: "Model-based Model",
    query: createQueryFromCard(baseModel),
  });

  return createAndVisitDashboard(page, mb, [qbq, mbq, qbm, mbm]);
}

async function createAndVisitDashboard(
  page: Page,
  mb: MetabaseHarness,
  cards: Card[],
): Promise<number> {
  let id = 0;
  const getNextId = () => --id;

  const dashboard: Dashboard = await createDashboardWithTabs(mb.api, {
    enable_embedding: true,
    embedding_params: {
      [DATE_PARAMETER.slug]: "enabled",
      [TEXT_PARAMETER.slug]: "enabled",
      [NUMBER_PARAMETER.slug]: "enabled",
    },
    parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
    dashcards: cards.map((card, index) => ({
      id: getNextId(),
      size_x: CARD_WIDTH,
      size_y: CARD_HEIGHT,
      row: CARD_HEIGHT * Math.floor(index / 2),
      col: index % 2 === 0 ? 0 : CARD_WIDTH,
      card,
      card_id: card.id,
    })),
  });

  await visitDashboard(page, mb.api, dashboard.id);
  return dashboard.id;
}

// === response waits (port of the cy.intercept aliases) ===

function isDashcardQuery(pathname: string): boolean {
  return /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query$/.test(
    pathname,
  );
}

/** Resolve after `count` POST dashcard-query responses (the @dashboardData
 * alias). Register BEFORE the triggering action. */
export function waitForDashboardData(page: Page, count: number): Promise<void> {
  let seen = 0;
  return page
    .waitForResponse((response) => {
      if (
        response.request().method() === "POST" &&
        isDashcardQuery(new URL(response.url()).pathname)
      ) {
        seen += 1;
      }
      return seen >= count;
    })
    .then(() => undefined);
}

/** Port of waitForPublicDashboardData: `count` GET /api/public/dashboard/…
 * dashcard responses. */
export function waitForPublicDashboardData(
  page: Page,
  count: number,
): Promise<void> {
  let seen = 0;
  return page
    .waitForResponse((response) => {
      if (
        /^\/api\/public\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+$/.test(
          new URL(response.url()).pathname,
        )
      ) {
        seen += 1;
      }
      return seen >= count;
    })
    .then(() => undefined);
}

/** Port of waitForEmbeddedDashboardData: `count` GET /api/embed/dashboard/…
 * dashcard responses. */
export function waitForEmbeddedDashboardData(
  page: Page,
  count: number,
): Promise<void> {
  let seen = 0;
  return page
    .waitForResponse((response) => {
      if (
        /^\/api\/embed\/dashboard\/[^/]+\/dashcard\/\d+\/card\/\d+$/.test(
          new URL(response.url()).pathname,
        )
      ) {
        seen += 1;
      }
      return seen >= count;
    })
    .then(() => undefined);
}

// === UI helpers ===

export function getFilter(page: Page, name: string): Locator {
  return page.getByTestId("fixed-width-filters").getByText(name, {
    exact: true,
  });
}

function getPopoverItems(page: Page): Locator {
  return popover(page).locator("[data-element-id=list-section]");
}

/**
 * @param index if more than 1 item with the same name is visible, specify which one
 */
function getPopoverItem(page: Page, name: string, index = 0): Locator {
  return popover(page).getByText(name, { exact: true }).nth(index);
}

async function pickPopoverItem(page: Page, name: string, index = 0) {
  const item = getPopoverItem(page, name, index);
  await item.scrollIntoViewIfNeeded();
  await item.click();
}

/** Open a dashcard's mapping popover and pick a column. */
async function mapDashcardColumn(
  page: Page,
  dashcardIndex: number,
  name: string,
  index = 0,
) {
  await getDashboardCard(page, dashcardIndex)
    .getByText("Select…", { exact: true })
    .click();
  await pickPopoverItem(page, name, index);
}

/** Port of the operator picker: sidebar's "Filter operator" select → "Between". */
async function setFilterOperatorBetween(page: Page) {
  await sidebar(page)
    .locator(":text('Filter operator') + *")
    .click();
  await popover(page).getByText("Between", { exact: true }).click();
}

async function clickAway(page: Page) {
  await page.locator("body").click({ position: { x: 0, y: 0 } });
}

/** Fill a between-number filter widget popover and apply it. */
async function applyBetweenNumberFilter(page: Page, from: string, to: string) {
  const pop = popover(page);
  await pop.getByPlaceholder("Enter a number", { exact: true }).nth(0).fill(from);
  await pop.getByPlaceholder("Enter a number", { exact: true }).nth(1).fill(to);
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
}

async function applyGadgetFilter(page: Page) {
  await popover(page).getByLabel("Gadget", { exact: true }).click();
  await popover(page)
    .getByRole("button", { name: "Add filter", exact: true })
    .click();
}

// === setup / apply functions ===

export async function setup1stStageExplicitJoinFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Text").click();

  await mapDashcardColumn(page, 0, "Reviewer", 0);
  await mapDashcardColumn(page, 1, "Reviewer", 0);

  await saveDashboard(page);
}

export async function apply1stStageExplicitJoinFilter(page: Page) {
  await filterWidget(page).first().click();
  const pop = popover(page).first();
  const search = pop.getByPlaceholder("Search the list", { exact: true });
  await search.click();
  await search.pressSequentially("abe.gorczany");
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
}

export async function setup1stStageImplicitJoinFromSourceFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Number").click();
  await setFilterOperatorBetween(page);

  await mapDashcardColumn(page, 0, "Price", 0);
  await mapDashcardColumn(page, 1, "Price", 0);

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  await applyBetweenNumberFilter(page, "0", "16");
  await wait;
}

export async function setup1stStageImplicitJoinFromJoinFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Text").click();

  await mapDashcardColumn(page, 0, "Category", 1);
  await mapDashcardColumn(page, 1, "Category", 1);

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  await applyGadgetFilter(page);
  await wait;
}

export async function setup1stStageCustomColumnFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Number").click();
  await setFilterOperatorBetween(page);

  await mapDashcardColumn(page, 0, "Net");
  await mapDashcardColumn(page, 1, "Net");

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  await applyBetweenNumberFilter(page, "0", "20");
  await wait;
}

export async function setup1stStageAggregationFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Number").click();
  await setFilterOperatorBetween(page);

  await mapDashcardColumn(page, 0, "Count");
  await mapDashcardColumn(page, 1, "Count");

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  await applyBetweenNumberFilter(page, "0", "2");
  await wait;
}

export async function setup1stStageBreakoutFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Text").click();

  await mapDashcardColumn(page, 0, "Category", 1);
  await mapDashcardColumn(page, 1, "Category", 1);

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  await applyGadgetFilter(page);
  await wait;
}

export async function setup2ndStageExplicitJoinFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Text").click();

  await mapDashcardColumn(page, 0, "Reviewer", 1);
  await mapDashcardColumn(page, 1, "Reviewer", 1);

  await saveDashboard(page);

  const wait = waitForDashboardData(page, 2);
  await filterWidget(page).first().click();
  const pop = popover(page).first();
  const search = pop.getByPlaceholder("Search the list", { exact: true });
  await search.click();
  await search.pressSequentially("abe.gorczany");
  await pop.getByRole("button", { name: "Add filter", exact: true }).click();
  await wait;
}

export async function setup2ndStageCustomColumnFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Number").click();
  await setFilterOperatorBetween(page);

  await mapDashcardColumn(page, 0, "5 * Count");
  await mapDashcardColumn(page, 1, "5 * Count");

  await saveDashboard(page);
}

export async function apply2ndStageCustomColumnFilter(page: Page) {
  await filterWidget(page).first().click();
  await applyBetweenNumberFilter(page, "0", "20");
}

export async function setup2ndStageAggregationFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Number").click();
  await setFilterOperatorBetween(page);

  await mapDashcardColumn(page, 0, "Count", 1);
  await mapDashcardColumn(page, 1, "Count", 1);
  await mapDashcardColumn(page, 2, "Count");
  await mapDashcardColumn(page, 3, "Count");

  await saveDashboard(page);
}

export async function apply2ndStageAggregationFilter(page: Page) {
  await filterWidget(page).first().click();
  await applyBetweenNumberFilter(page, "0", "2");
}

export async function setup2ndStageBreakoutFilter(page: Page) {
  await editDashboard(page);

  await getFilter(page, "Text").click();

  await mapDashcardColumn(page, 0, "Product → Category", 1);
  await closeToasts(page);

  await mapDashcardColumn(page, 1, "Product → Category", 1);

  await mapDashcardColumn(page, 2, "Product → Category");
  await closeToasts(page);

  await mapDashcardColumn(page, 3, "Product → Category");

  await saveDashboard(page);
}

async function closeToasts(page: Page) {
  for (const toast of await page.getByTestId("toast-undo").all()) {
    await icon(toast, "close").click();
  }
}

export async function apply2ndStageBreakoutFilter(page: Page) {
  await filterWidget(page).first().click();
  await applyGadgetFilter(page);
}

// === verification ===

type SectionName = string;
type ColumnName = string;
type MappingSection = [SectionName | null, ColumnName[]];

export async function verifyDashcardMappingOptions(
  page: Page,
  dashcardIndex: number,
  sections: MappingSection[],
) {
  await getDashboardCard(page, dashcardIndex)
    .getByText("Select…", { exact: true })
    .click();
  await verifyPopoverMappingOptions(page, sections);
  await clickAway(page);
}

export async function verifyNoDashcardMappingOptions(
  page: Page,
  dashcardIndex: number,
) {
  const card = getDashboardCard(page, dashcardIndex);
  await expect(card.getByText("No valid fields", { exact: true })).toBeVisible();

  await card.getByText("No valid fields", { exact: true }).hover();
  // A prior dashcard's tooltip can linger (fade-out) or Mantine can portal a
  // duplicate node, so the same tooltip text matches 2+ elements under CI load
  // → strict-mode violation. All matches carry identical text, so assert the
  // first visible one.
  await expect(
    tooltip(page)
      .getByText(
        "This card doesn't have any fields or parameters that can be mapped to this parameter type.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
}

async function verifyPopoverMappingOptions(
  page: Page,
  sections: MappingSection[],
) {
  const expectedItemsCount = sections.reduce(
    (sum, [sectionName, columnNames]) =>
      sum + (sectionName ? 1 : 0) + columnNames.length,
    0,
  );

  const items = getPopoverItems(page);
  await expect(items.first()).toBeVisible();

  let index = 0;
  let offsetForSearch = 0;

  // Skip the search box if it is the first item.
  if ((await items.nth(0).locator("input").count()) > 0) {
    index += 1;
    offsetForSearch = 1;
  }

  for (const [sectionName, columnNames] of sections) {
    if (sectionName) {
      // The list is virtualized, keep scrolling to see all the items.
      await items.nth(index).scrollIntoViewIfNeeded();
      await expect(items.nth(index)).toHaveText(sectionName);
      index += 1;
    }

    for (const columnName of columnNames) {
      await items.nth(index).scrollIntoViewIfNeeded();
      await expect(
        items.nth(index).getByLabel(columnName, { exact: true }),
      ).toBeVisible();
      index += 1;
    }
  }

  await expect(items).toHaveCount(expectedItemsCount + offsetForSearch);
}

async function assertCardTableRowsCount(card: Locator, value: number) {
  if (value > 0) {
    await expect(
      card.getByTestId("table-body").getByRole("row").first(),
    ).toBeVisible();
  }
  await expect(card.getByTestId("table-root")).toHaveAttribute(
    "data-rows-count",
    String(value),
  );
}

/** Port of H.assertTableRowsCount scoped to a dashcard — for the public /
 * embedded assertions that wrap it in `getDashboardCard(i).within(...)`. */
export async function assertDashcardRowsCount(
  page: Page,
  dashcardIndex: number,
  value: number,
) {
  await assertCardTableRowsCount(getDashboardCard(page, dashcardIndex), value);
}

export async function verifyDashcardRowsCount(
  page: Page,
  {
    dashcardIndex,
    dashboardCount,
    queryBuilderCount,
  }: {
    dashcardIndex: number;
    dashboardCount: number;
    queryBuilderCount: string;
  },
) {
  await assertCardTableRowsCount(
    getDashboardCard(page, dashcardIndex),
    dashboardCount,
  );

  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await getDashboardCard(page, dashcardIndex)
    .getByTestId("legend-caption-title")
    .click();
  await dataset;
  await expect(page.getByTestId("question-row-count")).toHaveText(
    queryBuilderCount,
  );
}

export async function goBackToDashboard(page: Page) {
  await page.getByLabel("Back to Test Dashboard", { exact: true }).click();
  await expect(page.getByTestId("dashboard-grid")).toBeVisible();
}

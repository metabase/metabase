/**
 * Helpers for the temporal-unit-parameters spec port
 * (dashboard-filters/temporal-unit-parameters.cy.spec.js).
 *
 * All genuinely new helpers this spec needs live here (parallel-agent rule:
 * no edits to shared modules). Everything else is imported from the existing
 * support surface — dashboard, dashboard-parameters, filters-repros, ui,
 * models, notebook, metrics, organization, embedding-dashboard.
 *
 * New here:
 * - the question-detail / parameter fixtures (ports of the spec-local consts)
 * - the spec-local UI helpers (addQuestion, removeQuestion, editParameter,
 *   backToDashboard, addTemporalUnitParameter)
 * - a native-aware createDashboardWithQuestions (the dashboard-parameters port
 *   only creates structured questions; this spec adds native cards too)
 * - createDashboardWithMappedQuestion / createDashboardWithMultiSeriesCard
 * - ensureDashboardCardHasText (port of H.ensureDashboardCardHasText — targets
 *   the `dashcard` testid, distinct from getDashboardCard's `dashcard-container`)
 * - resetFilterWidgetToDefault (port of H.resetFilterWidgetToDefault, the
 *   revert icon, hover-gated)
 * - dashcardTableHeaderColumn (H.tableHeaderColumn scoped to a dashcard, for
 *   the click-behavior `getDashboardCard(i).within(() => tableHeaderColumn(...))`)
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import {
  dashboardHeader,
  filterWidget,
  getDashboardCard,
  setFilter,
} from "./dashboard";
import {
  createDashboard,
  editingDashboardParametersContainer,
  type DashboardDetails,
} from "./dashboard-parameters";
import { updateDashboardCards } from "./filters-repros";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { icon, popover } from "./ui";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// === fixtures (ports of the spec-local consts) ===

export const dashboardDetails = {
  name: "Test Dashboard",
};

export const singleBreakoutQuestionDetails = {
  name: "Single breakout",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
};

export const multiBreakoutQuestionDetails = {
  name: "Multiple breakouts",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      [
        "field",
        PRODUCTS.CREATED_AT,
        { "temporal-unit": "year", "source-field": ORDERS.PRODUCT_ID },
      ],
    ],
  },
};

export const noBreakoutQuestionDetails = {
  name: "No breakouts",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    limit: 1,
  },
};

export const multiStageQuestionDetails = {
  name: "Multiple stages",
  display: "table",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          {
            "base-type": "type/DateTime",
            "temporal-unit": "month",
          },
        ],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 2],
    aggregation: [["avg", ["field", "count", { "base-type": "type/Integer" }]]],
    breakout: [
      [
        "field",
        "CREATED_AT",
        { "base-type": "type/DateTime", "temporal-unit": "year" },
      ],
    ],
  },
};

export const expressionBreakoutQuestionDetails = {
  name: "Breakout by expression",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    expressions: {
      Date: [
        "datetime-add",
        ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
        1,
        "day",
      ],
    },
    breakout: [
      [
        "expression",
        "Date",
        { "base-type": "type/DateTime", "temporal-unit": "day" },
      ],
    ],
  },
};

export const binningBreakoutQuestionDetails = {
  name: "Breakout by a column with a binning strategy",
  display: "table",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.TOTAL,
        { binning: { strategy: "num-bins", "num-bins": 100 } },
      ],
    ],
  },
};

export const nativeQuestionDetails = {
  name: "SQL query",
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS",
  },
};

export const nativeQuestionWithTextParameterDetails = {
  name: "SQL query with a text parameter",
  display: "table",
  native: {
    query: "SELECT * FROM PRODUCTS WHERE CATEGORY = {{category}}",
    "template-tags": {
      category: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "category",
        "display-name": "Category",
        type: "text",
      },
    },
  },
};

export const nativeQuestionWithDateParameterDetails = {
  name: "SQL query with a date parameter",
  display: "table",
  native: {
    query: "SELECT * FROM ORDERS WHERE {{date}}",
    "template-tags": {
      date: {
        id: "6b8b10ef-0104-1047-1e1b-2492d5954555",
        name: "date",
        "display-name": "Date",
        type: "dimension",
        dimension: ["field", ORDERS.CREATED_AT, null],
        "widget-type": "date/all-options",
      },
    },
  },
};

export const nativeUnitQuestionDetails = {
  name: "SQL units",
  display: "table",
  native: {
    query:
      "SELECT 'month' AS UNIT " +
      "UNION ALL SELECT 'year' AS UNIT " +
      "UNION ALL SELECT 'invalid' AS UNIT",
  },
};

export const nativeTimeQuestionDetails = {
  name: "SQL time",
  display: "table",
  native: {
    query: "SELECT CAST('10:00' AS TIME) AS TIME",
  },
};

export const getNativeTimeQuestionBasedQuestionDetails = (card: {
  id: number;
}) => ({
  query: {
    "source-table": `card__${card.id}`,
    aggregation: [["count"]],
    breakout: [["field", "TIME", { "base-type": "type/Time" }]],
  },
});

/** Port of the spec-local questionWithoutDefaultValue (native tests). */
export const questionWithoutDefaultValue = {
  name: "Saved question with time grouping",
  native: {
    query: `
        SELECT
          count(*),
          {{unit}} as unit
        FROM
          ORDERS
        GROUP BY
          unit
        `,
    "template-tags": {
      unit: {
        type: "temporal-unit",
        name: "unit",
        id: "eb345703-001c-4b2a-b7d5-71cb3efe4beb",
        "display-name": "Unit",
        dimension: ["field", ORDERS.CREATED_AT, null],
        required: true,
      },
    },
  },
};

export const parameterDetails = {
  id: "1",
  name: "Time grouping",
  slug: "unit_of_time",
  type: "temporal-unit",
  sectionId: "temporal-unit",
};

export const getParameterMapping = (card: { id: number }) => ({
  card_id: card.id,
  parameter_id: parameterDetails.id,
  target: [
    "dimension",
    [
      "field",
      ORDERS.CREATED_AT,
      {
        "base-type": "type/DateTime",
        "temporal-unit": "month",
      },
    ],
  ],
});

// === question / dashboard creation ===

type StructuredDetails = Parameters<MetabaseApi["createQuestion"]>[0];
type NativeDetails = {
  name?: string;
  type?: string;
  display?: string;
  database?: number;
  native: { query: string; "template-tags"?: Record<string, unknown> };
};
export type QuestionDetails = StructuredDetails | NativeDetails;

async function createCard(
  api: MetabaseApi,
  details: QuestionDetails,
): Promise<{ id: number }> {
  if ("native" in details) {
    const {
      name = "test question",
      type = "question",
      display = "table",
      database = SAMPLE_DB_ID,
      native,
    } = details;
    const response = await api.post("/api/card", {
      name,
      type,
      display,
      visualization_settings: {},
      dataset_query: { type: "native", native, database },
    });
    return (await response.json()) as { id: number };
  }
  return api.createQuestion(details);
}

/**
 * Native-aware port of H.createDashboardWithQuestions: the dashboard-parameters
 * port only creates structured questions (api.createQuestion), but this spec
 * mixes native cards (SQL units/time) into the same dashboard. Each dashcard
 * is placed at row 0/col 0 like the Cypress helper — the dashboard grid resolves
 * the overlap when rendering.
 */
export async function createDashboardWithQuestions(
  api: MetabaseApi,
  {
    dashboardDetails: details,
    questions,
  }: {
    dashboardDetails?: DashboardDetails;
    questions: QuestionDetails[];
  },
): Promise<{ dashboard: { id: number }; questions: { id: number }[] }> {
  const dashboard = await createDashboard(api, details);
  const created: { id: number }[] = [];
  for (const questionDetails of questions) {
    created.push(await createCard(api, questionDetails));
  }
  await api.put(`/api/dashboard/${dashboard.id}`, {
    dashcards: created.map((question, index) => ({
      id: -1 - index,
      card_id: question.id,
      row: 0,
      col: 0,
      size_x: 11,
      size_y: 8,
      visualization_settings: {},
      parameter_mappings: [],
    })),
  });
  return { dashboard, questions: created };
}

/** Port of the spec-local createDashboardWithMappedQuestion. */
export async function createDashboardWithMappedQuestion(
  api: MetabaseApi,
  {
    dashboardDetails: details = {},
    extraQuestions = [],
  }: { dashboardDetails?: DashboardDetails; extraQuestions?: QuestionDetails[] } = {},
): Promise<{ id: number }> {
  const {
    dashboard,
    questions: [card, ...extraCards],
  } = await createDashboardWithQuestions(api, {
    dashboardDetails: {
      parameters: [parameterDetails],
      ...details,
    },
    questions: [singleBreakoutQuestionDetails, ...extraQuestions],
  });
  await updateDashboardCards(api, {
    dashboard_id: dashboard.id,
    cards: [
      {
        card_id: card.id,
        parameter_mappings: [getParameterMapping(card)],
      },
      ...extraCards.map(({ id }) => ({ card_id: id })),
    ],
  });
  return dashboard;
}

/** Port of the spec-local createDashboardWithMultiSeriesCard. */
export async function createDashboardWithMultiSeriesCard(
  api: MetabaseApi,
): Promise<{ id: number }> {
  const dashboard = await createDashboard(api, dashboardDetails);
  const card1 = await api.createQuestion({
    ...singleBreakoutQuestionDetails,
    name: "Question 1",
    display: "line",
  });
  const card2 = await api.createQuestion({
    ...singleBreakoutQuestionDetails,
    name: "Question 2",
    display: "line",
  });
  await updateDashboardCards(api, {
    dashboard_id: dashboard.id,
    cards: [{ card_id: card1.id, series: [{ id: card2.id }] }],
  });
  return dashboard;
}

// === spec-local UI helpers ===

/** Port of the spec-local backToDashboard. */
export async function backToDashboard(page: Page) {
  await page.getByLabel(`Back to ${dashboardDetails.name}`).click();
}

/** Port of the spec-local addTemporalUnitParameter (H.setFilter("Time grouping")). */
export async function addTemporalUnitParameter(page: Page) {
  await setFilter(page, "Time grouping");
}

/** Port of the spec-local addQuestion. */
export async function addQuestion(page: Page, name: string) {
  await icon(dashboardHeader(page), "add").click();
  await page
    .getByTestId("add-card-sidebar")
    .getByText(name, { exact: true })
    .click();
}

/** Port of the spec-local removeQuestion (the close icon is hover-gated). */
export async function removeQuestion(page: Page) {
  const card = getDashboardCard(page);
  await card.hover();
  await icon(card, "close").first().click({ force: true });
}

/**
 * Faithful port of H.selectDashboardFilter (e2e-dashboard-helpers.ts): the real
 * helper uses `popover().contains(filterName)` — case-sensitive SUBSTRING,
 * first-match — not exact. The dashboard-parameters.ts port uses exact, which
 * fails here because the mapping row reads "Created At: Month" (the breakout
 * unit), not a bare "Created At".
 */
export async function selectDashboardFilter(dashcard: Locator, filterName: string) {
  const page = dashcard.page();
  await dashcard.getByText("Select…").click();
  await popover(page)
    .getByText(new RegExp(escapeRegExp(filterName)))
    .first()
    .click({ force: true });
}

/** Port of the spec-local editParameter. */
export async function editParameter(page: Page, name: string) {
  await editingDashboardParametersContainer(page)
    .getByText(name, { exact: true })
    .click();
}

// === assertions / widgets ===

/**
 * Port of H.ensureDashboardCardHasText — note the `dashcard` testid (distinct
 * from getDashboardCard's `dashcard-container`).
 */
export async function ensureDashboardCardHasText(
  page: Page,
  text: string,
  index = 0,
) {
  await expect(page.getByTestId("dashcard").nth(index)).toContainText(text);
}

/** Port of H.resetFilterWidgetToDefault (the revert icon, hover-gated). */
export async function resetFilterWidgetToDefault(page: Page, index = 0) {
  const widget = filterWidget(page).nth(index);
  await widget.hover();
  await icon(widget, "revert").click();
}

/**
 * Port of H.tableHeaderColumn scoped to a dashcard — the click-behavior tests
 * assert `getDashboardCard(i).within(() => H.tableHeaderColumn(name))`, which is
 * an implicit existence assertion on the header cell.
 */
export function dashcardTableHeaderColumn(
  card: Locator,
  name: string,
): Locator {
  return card
    .getByTestId("header-cell")
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
}

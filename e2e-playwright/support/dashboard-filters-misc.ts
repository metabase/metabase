/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters-2/dashboard-filters-misc.cy.spec.ts.
 *
 * The upstream spec was trimmed (by "Remove querying e2e tests made redundant
 * by backend test parity") to a single "pivot tables" test that checks a pivot
 * dashcard doesn't expose an extra filtering stage when mapping parameters. It
 * shares the query-stages fixtures — `createBaseQuestions`, `createQ1Query`,
 * `getFilter`, `verify*DashcardMappingOptions`, and the column-name consts —
 * which are imported read-only from support/dashboard-filters-2.ts.
 *
 * The only surface unique to this spec is the pivot question query and the
 * single-card dashboard creation (the query-stages module keeps its equivalent
 * `createAndVisitDashboard` private, so the parameter definitions and card
 * sizing are reproduced here — they mirror that module's constants exactly).
 */
import type { Page } from "@playwright/test";

import { createQ1Query } from "./dashboard-filters-2";
import type { Card, Dashboard } from "./factories";
import { createDashboardWithTabs, createQuestion } from "./factories";
import type { MetabaseApi } from "./api";
import { SAMPLE_DATABASE } from "./sample-data";
import { visitDashboard } from "./ui";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

type MetabaseHarness = { api: MetabaseApi };
type StructuredQuery = Record<string, unknown>;

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

/** Port of the spec-local createPivotableQuery: Q1 (join + custom column) plus
 * a count aggregation and two breakouts (Orders → Created At by month, Product
 * → Category via the Orders→Products FK). */
export function createPivotableQuery(source: Card): StructuredQuery {
  return {
    ...createQ1Query(source),
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
      [
        "field",
        PRODUCTS.CATEGORY,
        {
          "base-type": "type/Text",
          "source-field": ORDERS.PRODUCT_ID,
        },
      ],
    ],
  };
}

/** Port of the spec-local createAndVisitDashboard, specialised to a single
 * pivot card. Creates the embedding-enabled dashboard with the Date/Text/Number
 * parameters and one dashcard, then visits it. Returns the dashboard id. */
export async function createAndVisitPivotDashboard(
  page: Page,
  mb: MetabaseHarness,
  card: Card,
): Promise<number> {
  const dashboard: Dashboard = await createDashboardWithTabs(mb.api, {
    enable_embedding: true,
    embedding_params: {
      [DATE_PARAMETER.slug]: "enabled",
      [TEXT_PARAMETER.slug]: "enabled",
      [NUMBER_PARAMETER.slug]: "enabled",
    },
    parameters: [DATE_PARAMETER, TEXT_PARAMETER, NUMBER_PARAMETER],
    dashcards: [
      {
        id: -1,
        size_x: CARD_WIDTH,
        size_y: CARD_HEIGHT,
        row: 0,
        col: 0,
        card,
        card_id: card.id,
      },
    ],
  });

  await visitDashboard(page, mb.api, dashboard.id);
  return dashboard.id;
}

/** Port of the spec-local createPivotQuestion. */
export async function createPivotQuestion(
  api: MetabaseApi,
  source: Card,
): Promise<Card> {
  return createQuestion(api, {
    type: "question",
    query: createPivotableQuery(source),
    name: "Question - pivot viz",
    display: "pivot",
  });
}

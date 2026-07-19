/**
 * Helpers for duplicate-dashcards-tabs.spec.ts (port of
 * e2e/test/scenarios/dashboard-cards/duplicate-dashcards-tabs.cy.spec.js).
 *
 * The mock builders (mockParameter / mockQuestionDashboardCard) are imported
 * read-only from the shared dashboard-parameters module.
 */
import { SAMPLE_DATABASE } from "./sample-data";
import { mockParameter, mockQuestionDashboardCard } from "./dashboard-parameters";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

export const PARAMETER = {
  CATEGORY: mockParameter({
    id: "2",
    name: "Category",
    type: "string/=",
  }),
};

export const DASHBOARD_CREATE_INFO = {
  parameters: Object.values(PARAMETER),
};

export const MAPPED_QUESTION_CREATE_INFO = {
  name: "Products",
  query: { "source-table": PRODUCTS_ID },
};

/** Port of the spec-local createMappedDashcard: a Products dashcard mapped to
 * the Category parameter on PRODUCTS.CATEGORY. */
export function createMappedDashcard(
  mappedQuestionId: number,
): Record<string, unknown> {
  return mockQuestionDashboardCard({
    id: 1,
    card_id: mappedQuestionId,
    parameter_mappings: [
      {
        parameter_id: PARAMETER.CATEGORY.id,
        card_id: mappedQuestionId,
        target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
      },
    ],
    row: 0,
    col: 0,
    size_x: 10,
    size_y: 5,
  });
}

export const EVENTS = {
  duplicateDashcard: { event: "dashboard_card_duplicated" },
  duplicateTab: { event: "dashboard_tab_duplicated" },
  saveDashboard: { event: "dashboard_saved" },
};

// TODO: no snowplow-micro container in the spike harness (port rule 6). Both
// tests keep their real UI actions; only the snowplow event assertions
// (reset/enable/expect) are neutered.
export const resetSnowplow = async () => {};
export const enableTracking = async () => {};
export const expectNoBadSnowplowEvents = async () => {};
export const expectUnstructuredSnowplowEvent = async (
  _event: Record<string, unknown>,
  _count?: number,
) => {};

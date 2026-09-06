/**
 * Helpers for cc-boolean-functions.spec.ts — the dashboard-setup fixtures and
 * factory from the "dashboards" describe of
 * e2e/test/scenarios/custom-column/cc-boolean-functions.cy.spec.ts.
 *
 * Lives in its own file so the shared support modules stay untouched. The
 * query-builder describes reuse existing shared helpers directly (notebook.ts,
 * multiple-column-breakouts.ts, ui.ts) and need nothing here.
 */
import type { MetabaseApi } from "./api";
import { createMockDashboardCard } from "./click-behavior";
import { createDashboard, createQuestion } from "./factories";
import type { DashboardDetails, Dashboard } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";

const { PEOPLE_ID, PEOPLE } = SAMPLE_DATABASE;

/** The custom-column expression name asserted throughout the spec. */
export const EXPRESSION_NAME = "Boolean column";

/**
 * Port of the dashboards describe's `questionDetails`: a People question with a
 * boolean starts-with custom column on the Name field.
 */
export const dashboardQuestionDetails = {
  name: "Q1",
  query: {
    "source-table": PEOPLE_ID,
    fields: [
      ["field", PEOPLE.NAME, { "base-type": "type/Text" }],
      ["expression", EXPRESSION_NAME, { "base-type": "type/Boolean" }],
    ],
    expressions: {
      [EXPRESSION_NAME]: ["starts-with", ["field", PEOPLE.NAME, null], "Sydney"],
    },
  },
};

/** Port of the spec's `parameterDetails`. */
export const parameterDetails = {
  name: "City",
  slug: "city",
  id: "27454068",
  type: "string/contains",
  sectionId: "string",
};

/** Port of the spec's `dashboardDetails`. */
export const dashboardDetails: DashboardDetails = {
  name: "D1",
  parameters: [parameterDetails],
};

function getParameterMapping(cardId: number) {
  return {
    card_id: cardId,
    parameter_id: parameterDetails.id,
    target: ["dimension", ["field", PEOPLE.CITY, { "base-type": "type/Text" }]],
  };
}

/**
 * Port of the spec-local createDashboardWithQuestion: create the dashboard
 * (name + City parameter), create the Q1 question, then PUT a single dashcard
 * that maps the parameter to People.City. Returns the created dashboard.
 */
export async function createDashboardWithQuestion(
  api: MetabaseApi,
  opts?: DashboardDetails,
): Promise<Dashboard> {
  const dashboard = await createDashboard(api, { ...dashboardDetails, ...opts });
  const card = await createQuestion(api, dashboardQuestionDetails);
  await api.put(`/api/dashboard/${dashboard.id}`, {
    dashcards: [
      createMockDashboardCard({
        card_id: card.id,
        parameter_mappings: [getParameterMapping(card.id)],
        size_x: 8,
        size_y: 8,
      }),
    ],
  });
  return dashboard;
}

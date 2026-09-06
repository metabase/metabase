/**
 * Helpers for dashboard-filters-sql-required-field-filter.spec.ts — a SQL
 * question whose `filter` template-tag is a REQUIRED dimension (field) filter
 * on PRODUCTS.CATEGORY, connected to a dashboard "category" filter. Fixture
 * data + the create-connect-map setup are ported from the Cypress spec's `it`
 * body (there is no beforeEach setup beyond restore/signIn).
 */
import type { MetabaseApi } from "./api";
import {
  createNativeQuestionAndDashboard,
  type DashboardDetails,
  type NativeQuestionDetails,
} from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";

const { PRODUCTS } = SAMPLE_DATABASE;

/**
 * The required variant of the Cypress `questionDetails` (immer `produce`
 * flipped `filter.required` to true). Written directly here rather than
 * deriving a non-required base — only the required form is used.
 */
export const questionDetailsWithRequiredFilter: NativeQuestionDetails = {
  name: "SQL products category, required, 2 selections",
  native: {
    query: "select distinct category from PRODUCTS where {{filter}}",
    "template-tags": {
      filter: {
        id: "e33dc805-6b71-99a5-ee14-128383953986",
        name: "filter",
        "display-name": "Filter",
        type: "dimension",
        dimension: ["field", PRODUCTS.CATEGORY, null],
        "widget-type": "category",
        default: ["Gizmo", "Gadget"],
        required: true,
      },
    },
  },
};

export const filter = {
  name: "Category",
  slug: "category",
  id: "49fcc65c",
  type: "category",
  default: "Widget",
};

export const dashboardDetails: DashboardDetails = {
  name: "Required Filters Dashboard",
  parameters: [filter],
};

/**
 * Port of the Cypress `it` setup: create the native question + dashboard, then
 * map the dashboard filter onto the card's `filter` template-tag via
 * H.editDashboardCard (which re-PUTs the existing dashcard with the merged
 * parameter_mappings). Returns the dashboard id to visit.
 */
export async function setupRequiredFieldFilterDashboard(
  api: MetabaseApi,
): Promise<number> {
  const { card_id, dashboard_id } = await createNativeQuestionAndDashboard(api, {
    questionDetails: questionDetailsWithRequiredFilter,
    dashboardDetails,
  });

  // H.editDashboardCard sanitizes the existing dashcard (drops created_at /
  // updated_at) and PUTs it back with the new parameter_mappings merged in.
  const dashboard = (await (
    await api.get(`/api/dashboard/${dashboard_id}`)
  ).json()) as { dashcards: Record<string, unknown>[] };
  const { created_at, updated_at, ...dashcard } = dashboard.dashcards[0];
  void created_at;
  void updated_at;

  await api.put(`/api/dashboard/${dashboard_id}`, {
    dashcards: [
      {
        ...dashcard,
        parameter_mappings: [
          {
            parameter_id: filter.id,
            card_id,
            target: ["dimension", ["template-tag", "filter"]],
          },
        ],
      },
    ],
  });

  return dashboard_id;
}

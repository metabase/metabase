/**
 * Helpers for dashboard-filters-sql-management.spec.ts — managing a
 * SQL-template-tag-backed dashboard filter: connect/disconnect the tag, change
 * the widget's operator, and verify the mapping resets. Fixture data + the
 * create-and-visit setup are ported from the Cypress spec's beforeEach.
 */
import type { MetabaseApi } from "./api";
import {
  createNativeQuestionAndDashboard,
  type NativeQuestionDetails,
} from "./factories";

export const questionDetails: NativeQuestionDetails = {
  name: "SQL question with Number variable",
  native: {
    "template-tags": {
      tax: {
        type: "number",
        name: "tax",
        id: "0a60ecb5-69b8-49e8-b494-ad67ad7d1050",
        "display-name": "Tax GTE",
        "widget-type": null,
        default: null,
      },
    },
    query: "select * from orders where tax >= {{tax}};",
  },
};

/**
 * Port of the number-filter describe's beforeEach: create the native question +
 * dashboard (no parameter mappings — the test connects the filter through the
 * UI), returning the dashboard id to visit.
 */
export async function setupSqlManagementDashboard(
  api: MetabaseApi,
): Promise<number> {
  const { dashboardId } = await createNativeQuestionAndDashboard(api, {
    questionDetails,
  });
  return dashboardId;
}

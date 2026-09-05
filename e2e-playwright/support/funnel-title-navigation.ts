/**
 * Helpers for the funnel-title-navigation spec port
 * (e2e/test/scenarios/dashboard/visualizer/funnel-title-navigation.cy.spec.ts).
 *
 * New helpers only (parallel-agent rule). Everything else (createNativeQuestion,
 * createDashboard, getDashboardCard, visitDashboard, clickOnCardTitle) reuses
 * existing support modules and is imported read-only.
 *
 * This module carries only the spec-specific setup: create the native funnel
 * base question, create the dashboard, then PUT a single visualizer-funnel
 * dashcard that reprojects the base question's columns. The Cypress helper did
 * this inline via a raw `cy.request("PUT", ...)`; the visualizer settings shape
 * is bulky and spec-specific, so it lives here to keep the spec readable.
 */
import type { MetabaseApi } from "./api";
import { createDashboard, createNativeQuestion } from "./factories";

/**
 * Port of the UXW-2692 setup: a native funnel question, a dashboard, and one
 * visualizer-funnel dashcard pointing at that question. Returns the ids the
 * test asserts against.
 */
export async function createFunnelVisualizerDashboard(
  api: MetabaseApi,
  { visualizerTitle }: { visualizerTitle: string },
): Promise<{ questionId: number; dashboardId: number }> {
  const question = await createNativeQuestion(api, {
    name: "UXW-2692 Funnel Base",
    display: "funnel",
    native: {
      query: `
          SELECT 73 AS "Val", 'Downloads' AS "Step"
          UNION ALL
          SELECT 52 AS "Val", 'Followers' AS "Step"
        `,
    },
    visualization_settings: {
      "funnel.metric": "Val",
      "funnel.dimension": "Step",
    },
  });
  const questionId = question.id;

  const dashboard = await createDashboard(api, { name: "UXW-2692 Dashboard" });
  const dashboardId = dashboard.id;

  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: [
      {
        id: -1,
        card_id: questionId,
        dashboard_tab_id: null,
        row: 0,
        col: 0,
        size_x: 12,
        size_y: 8,
        visualization_settings: {
          visualization: {
            display: "funnel",
            columnValuesMapping: {
              COLUMN_1: [
                {
                  name: "COLUMN_1",
                  originalName: "Step",
                  sourceId: `card:${questionId}`,
                },
              ],
              COLUMN_2: [
                {
                  name: "COLUMN_2",
                  originalName: "Val",
                  sourceId: `card:${questionId}`,
                },
              ],
            },
            settings: {
              "card.title": visualizerTitle,
              "funnel.metric": "COLUMN_2",
              "funnel.dimension": "COLUMN_1",
              "funnel.rows": [
                { key: "Followers", name: "Followers", enabled: true },
                { key: "Downloads", name: "Downloads", enabled: true },
              ],
            },
          },
        },
      },
    ],
  });

  return { questionId, dashboardId };
}

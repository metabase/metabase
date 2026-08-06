import { createNativeQuestion } from "e2e/support/helpers";
import type {
  CardId,
  Dashboard,
  DashboardCard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import { type DashboardDetails, createDashboard } from "./createDashboard";
import type { NativeQuestionDetails } from "./createQuestion";

export const createNativeQuestionAndDashboard = ({
  questionDetails,
  dashboardDetails,
  cardDetails,
}: {
  questionDetails: NativeQuestionDetails;
  dashboardDetails?: DashboardDetails;
  cardDetails?: Partial<UpdateDashboardCardRequest>;
}): Cypress.Chainable<
  Cypress.Response<DashboardCard> & {
    dashboardId: DashboardId;
    dashboardTabs: Dashboard["tabs"];
    questionId: CardId;
  }
> => {
  const tabs = dashboardDetails?.tabs ?? [];
  const defaultTabId = tabs[0]?.id ?? null;

  // @ts-expect-error - Cypress typings don't account for what happens in then() here
  return createNativeQuestion(questionDetails).then(
    ({ body: { id: questionId } }) => {
      createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          const dashcard: Partial<UpdateDashboardCardRequest> = {
            id: -1,
            card_id: questionId,
            dashboard_tab_id: defaultTabId,
            // Add sane defaults for the dashboard card size and position
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 6,
            ...cardDetails,
          };

          cy.request("PUT", `/api/dashboard/${dashboardId}`, {
            tabs: tabs.map(({ id, name }) => ({ id, name })),
            dashcards: [
              {
                id: dashcard.id,
                card_id: dashcard.card_id,
                action_id: dashcard.action_id,
                dashboard_tab_id: dashcard.dashboard_tab_id,
                row: dashcard.row,
                col: dashcard.col,
                size_x: dashcard.size_x,
                size_y: dashcard.size_y,
                visualization_settings: dashcard.visualization_settings,
                parameter_mappings: dashcard.parameter_mappings,
                inline_parameters: dashcard.inline_parameters,
                series: dashcard.series,
              },
            ],
          }).then((response) => ({
            ...response,
            dashboardId,
            dashboardTabs: response.body.tabs,
            body: response.body.dashcards[0],
            questionId,
          }));
        },
      );
    },
  );
};

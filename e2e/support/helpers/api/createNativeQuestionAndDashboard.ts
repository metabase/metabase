import { createNativeQuestion } from "e2e/support/helpers";
import type { CardId, Dashboard, DashboardCard } from "metabase-types/api";

import { type DashboardDetails, createDashboard } from "./createDashboard";
import type { NativeQuestionDetails } from "./createQuestion";

export const createNativeQuestionAndDashboard = ({
  questionDetails,
  dashboardDetails,
  cardDetails,
}: {
  questionDetails: NativeQuestionDetails;
  dashboardDetails?: DashboardDetails;
  cardDetails?: Partial<DashboardCard>;
}): Cypress.Chainable<
  Cypress.Response<DashboardCard> & { questionId: CardId }
> => {
  return createNativeQuestion(questionDetails).then(
    ({ body: { id: questionId } }) => {
      return createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          return cy
            .request<Dashboard>("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [
                {
                  id: -1,
                  card_id: questionId,
                  // Add sane defaults for the dashboard card size
                  row: 0,
                  col: 0,
                  size_x: 11,
                  size_y: 6,
                  ...cardDetails,
                },
              ],
            })
            .then(response => ({
              ...response,
              body: response.body.dashcards[0],
              questionId,
            }));
        },
      );
    },
  );
};

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
import { updateDashboard } from "./updateDashboard";

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
  const { tabs = [], ...detailsWithoutTabs } = dashboardDetails ?? {};
  const defaultTabId = tabs[0]?.id ?? null;

  // @ts-expect-error - Cypress typings don't account for what happens in then() here
  return createNativeQuestion(questionDetails).then(
    ({ body: { id: questionId } }) => {
      createDashboard(detailsWithoutTabs).then(
        ({ body: { id: dashboardId } }) => {
          return updateDashboard({
            id: dashboardId,
            tabs,
            dashcards: [
              {
                id: -1,
                card_id: questionId,
                dashboard_tab_id: defaultTabId,
                // Add sane defaults for the dashboard card size and position
                row: 0,
                col: 0,
                size_x: 11,
                size_y: 6,
                ...cardDetails,
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

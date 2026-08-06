import type {
  Dashboard,
  DashboardCard,
  DashboardId,
  UpdateDashboardCardRequest,
} from "metabase-types/api";

import {
  type NativeQuestionDetails,
  createNativeQuestion,
} from "./createNativeQuestion";
import {
  type StructuredQuestionDetails,
  createQuestion,
} from "./createQuestion";

export const createQuestionAndAddToDashboard = (
  query: NativeQuestionDetails | StructuredQuestionDetails,
  dashboardId: DashboardId,
  card?: Partial<UpdateDashboardCardRequest>,
): Cypress.Chainable<Cypress.Response<DashboardCard>> =>
  (isNative(query) ? createNativeQuestion(query) : createQuestion(query)).then(
    ({ body: { id: card_id } }) =>
      cy
        .request<Dashboard>(`/api/dashboard/${dashboardId}`)
        .then(({ body: { dashcards } }) => {
          const newDashcard: Partial<UpdateDashboardCardRequest> = {
            id: -1,
            card_id,
            // Add sane defaults for the dashboard card size and position
            row: 0,
            col: 0,
            size_x: 11,
            size_y: 8,
            ...card,
          };

          return cy
            .request("PUT", `/api/dashboard/${dashboardId}`, {
              dashcards: [...dashcards, newDashcard].map((currentCard) => {
                const dashcard: Partial<UpdateDashboardCardRequest> =
                  currentCard;

                return {
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
                };
              }),
            })
            .then((response) => ({
              ...response,
              body: response.body.dashcards.at(-1),
            }));
        }),
  );

const isNative = (
  query: NativeQuestionDetails | StructuredQuestionDetails,
): query is NativeQuestionDetails => {
  return "native" in query;
};

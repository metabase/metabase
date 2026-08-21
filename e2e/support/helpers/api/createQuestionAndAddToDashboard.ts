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
import { updateDashboard } from "./updateDashboard";

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
          return updateDashboard({
            id: dashboardId,
            dashcards: [
              ...dashcards,
              {
                id: -1,
                card_id,
                // Add sane defaults for the dashboard card size and position
                row: 0,
                col: 0,
                size_x: 11,
                size_y: 8,
                ...card,
              },
            ],
          }).then((response) => ({
            ...response,
            // PUT returns the dashboard we just wrote, including the dashcard we appended
            body: response.body.dashcards.at(-1) as DashboardCard,
          }));
        }),
  );

const isNative = (
  query: NativeQuestionDetails | StructuredQuestionDetails,
): query is NativeQuestionDetails => {
  return "native" in query;
};

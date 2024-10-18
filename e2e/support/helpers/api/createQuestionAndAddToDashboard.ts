import type { Card, DashboardCard, DashboardId } from "metabase-types/api";

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
  card?: Partial<Card>,
): Cypress.Chainable<Cypress.Response<DashboardCard>> =>
  (isNative(query) ? createNativeQuestion(query) : createQuestion(query)).then(
    ({ body: { id: card_id } }) =>
      cy
        .request(`/api/dashboard/${dashboardId}`)
        .then(({ body: { dashcards } }) =>
          cy
            .request("PUT", `/api/dashboard/${dashboardId}`, {
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
            })
            .then(response => ({
              ...response,
              body: response.body.dashcards.at(-1),
            })),
        ),
  );

const isNative = (
  query: NativeQuestionDetails | StructuredQuestionDetails,
): query is NativeQuestionDetails => {
  return "native" in query;
};

import type { Card, Dashboard } from "metabase-types/api";

import { cypressWaitAll } from "../e2e-misc-helpers";

import { type DashboardDetails, createDashboard } from "./createDashboard";
import type { NativeQuestionDetails } from "./createNativeQuestion";
import type { StructuredQuestionDetails } from "./createQuestion";
import { createQuestionAndAddToDashboard } from "./createQuestionAndAddToDashboard";

export const createDashboardWithQuestions = ({
  dashboardName,
  dashboardDetails,
  questions,
  cards,
}: {
  dashboardName?: string;
  dashboardDetails?: DashboardDetails;
  questions: (NativeQuestionDetails | StructuredQuestionDetails)[];
  cards?: Partial<Card>[];
}): Cypress.Chainable<
  Cypress.Response<{
    dashboard: Dashboard;
    questions: Card;
  }>
> => {
  // @ts-expect-error - Cypress typings don't account for what happens in then() here
  return createDashboard({ name: dashboardName, ...dashboardDetails }).then(
    ({ body: dashboard }) => {
      return cypressWaitAll(
        questions.map((query, index) =>
          createQuestionAndAddToDashboard(
            query,
            dashboard.id,
            cards ? cards[index] : undefined,
          ),
        ),
      ).then(dashcardResponses => {
        const questions = dashcardResponses.map(
          dashcardResponse => dashcardResponse.body.card,
        );

        return {
          questions,
          dashboard,
        };
      });
    },
  );
};

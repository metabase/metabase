import type { Card, Dashboard, DashboardCard } from "metabase-types/api";

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
  cards?: Partial<DashboardCard>[];
}): Cypress.Chainable<{
  dashboard: Dashboard;
  questions: Card[];
}> => {
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
      ).then((dashcardResponses) => {
        const questions = dashcardResponses.map(
          (dashcardResponse) => dashcardResponse.body.card,
        );

        return {
          questions,
          dashboard,
        };
      });
    },
  );
};

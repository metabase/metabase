import { cypressWaitAll } from "e2e/support/helpers";

Cypress.Commands.add(
  "createDashboardWithQuestions",
  ({ dashboardName, dashboardDetails, questions, cards }) => {
    return cy
      .createDashboard({ name: dashboardName, ...dashboardDetails })
      .then(({ body: dashboard }) => {
        return cypressWaitAll(
          questions.map((query, index) =>
            cy.createQuestionAndAddToDashboard(
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
      });
  },
);

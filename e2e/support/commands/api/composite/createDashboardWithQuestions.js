import { cypressWaitAll } from "e2e/support/helpers";

Cypress.Commands.add(
  "createDashboardWithQuestions",
  ({ dashboardName, dashboardDetails, questions }) => {
    return cy
      .createDashboard({ name: dashboardName, ...dashboardDetails })
      .then(({ body: dashboard }) => {
        return cypressWaitAll(
          questions.map(query =>
            cy.createQuestionAndAddToDashboard(query, dashboard.id),
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

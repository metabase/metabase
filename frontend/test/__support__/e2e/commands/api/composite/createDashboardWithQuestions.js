import { cypressWaitAll } from "__support__/e2e/helpers";

Cypress.Commands.add(
  "createDashboardWithQuestions",
  ({ dashboardName, questions, parameters }) => {
    return cy
      .createDashboard({ name: dashboardName, parameters })
      .then(({ body: dashboard }) => {
        return cypressWaitAll(
          questions.map(query =>
            cy.createQuestionAndAddToDashboard(query, dashboard.id),
          ),
        ).then(questions => {
          return {
            questions,
            dashboard,
          };
        });
      });
  },
);

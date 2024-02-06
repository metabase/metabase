Cypress.Commands.add(
  "createNativeQuestionAndDashboard",
  ({ questionDetails, dashboardDetails } = {}) => {
    const tabs = dashboardDetails?.tabs ?? [];
    const defaultTabId = tabs[0]?.id ?? null;

    cy.createNativeQuestion(questionDetails).then(
      ({ body: { id: questionId } }) => {
        cy.createDashboard(dashboardDetails).then(
          ({ body: { id: dashboardId } }) => {
            cy.request("PUT", `/api/dashboard/${dashboardId}`, {
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
                },
              ],
            }).then(response => ({
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
  },
);

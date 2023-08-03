import {
  editDashboard,
  restore,
  showDashboardCardActions,
  visitDashboard,
} from "e2e/support/helpers";

const PG_DB_ID = 2;

const questionDetails = {
  name: "Q1",
  native: { query: "SELECT 1, pg_sleep(600)" },
  database: PG_DB_ID,
};

describe("issue 12926", { tags: "@external" }, () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dashboard/*/card/*/query").as("query");
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  describe("field source", () => {
    it("should stop the ongoing query when removing a card from a dashboard", done => {
      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        visitDashboard(dashboard_id, { should_wait: false });
      });

      cy.window().then(win => {
        cy.stub(win.XMLHttpRequest.prototype, "abort").as("xhrAbort");
      });

      editDashboard();

      showDashboardCardActions();

      cy.findByTestId("dashboardcard-actions-panel").within(() => {
        cy.findByLabelText("close icon").click();
      });

      cy.on("fail", err => {
        if (
          err.name === "CypressError" &&
          err.message.includes("query") &&
          err.message.includes("Timed out")
        ) {
          done();
          return true;
        }
        throw err;
      });
      cy.wait("@query", { timeout: 2000 }).then(() => {
        throw new Error("Request wasn't cancelled");
      });
    });
  });
});

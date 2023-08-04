import {
  editDashboard,
  restore,
  showDashboardCardActions,
  undo,
} from "e2e/support/helpers";

const questionDetails = {
  name: "Q1",
  native: { query: "SELECT 1" },
};

describe("issue 12926", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("field source", () => {
    it("should stop the ongoing query when removing a card from a dashboard", () => {
      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      cy.window().then(win => {
        cy.stub(win.XMLHttpRequest.prototype, "abort").as("xhrAbort");
      });

      removeCard();

      cy.get("@xhrAbort").should("have.been.calledOnce");
    });

    it("should re-fetch the query when doing undo on the removal", () => {
      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      removeCard();

      // stub the response so that the we can wait the request to see if it has been made
      // without the stub it would go in timeout as the query is longer than the default timeout
      cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query", req => {
        req.reply({});
      }).as("cardQuery");

      undo();

      cy.wait("@cardQuery");
    });
  });
});

function removeCard() {
  editDashboard();

  showDashboardCardActions();

  cy.findByTestId("dashboardcard-actions-panel").within(() => {
    cy.findByLabelText("close icon").click();
  });
}

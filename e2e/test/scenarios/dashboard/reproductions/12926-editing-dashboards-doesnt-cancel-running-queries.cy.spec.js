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
      slowDownQuery();

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
      slowDownQuery();

      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      removeCard();

      restoreQuery();

      undo();

      cy.wait("@cardQueryRestored").then(a => console.log("aa", a));
    });
  });
});

function slowDownQuery() {
  cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query", req => {
    req.on("response", res => {
      res.setDelay(10000);
    });
  }).as("cardQuerySlowed");
}

function restoreQuery() {
  cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query", req => {
    req.continue();
  }).as("cardQueryRestored");
}

function removeCard() {
  editDashboard();

  showDashboardCardActions();

  cy.findByTestId("dashboardcard-actions-panel").within(() => {
    cy.findByLabelText("close icon").click();
  });
}

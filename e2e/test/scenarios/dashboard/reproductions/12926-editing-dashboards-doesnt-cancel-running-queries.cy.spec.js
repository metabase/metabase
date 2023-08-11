import {
  editDashboard,
  getDashboardCard,
  openQuestionsSidebar,
  popover,
  restore,
  saveDashboard,
  setFilter,
  showDashboardCardActions,
  sidebar,
  undo,
} from "e2e/support/helpers";

const filterDisplayName = "F";
const questionDetails = {
  name: "Question 1",
  native: {
    query: "SELECT 42 [[+{{F}}]] as ANSWER",
    "template-tags": {
      F: {
        type: "number",
        name: "F",
        id: "b22a5ce2-fe1d-44e3-8df4-f8951f7921bc",
        "display-name": filterDisplayName,
      },
    },
  },
};

describe("issue 12926", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("card removal while query is in progress", () => {
    it("should stop the ongoing query when removing a card from a dashboard", () => {
      slowDownDashcardQuery();

      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      cy.window().then(win => {
        cy.spy(win.XMLHttpRequest.prototype, "abort").as("xhrAbort");
      });

      removeCard();

      cy.get("@xhrAbort").should("have.been.calledOnce");
    });

    it("should re-fetch the query when doing undo on the removal", () => {
      slowDownDashcardQuery();

      cy.createNativeQuestionAndDashboard({
        questionDetails,
      }).then(({ body: { dashboard_id } }) => {
        cy.visit(`/dashboard/${dashboard_id}`);
      });

      removeCard();

      restoreDashcardQuery();

      undo();

      cy.wait("@dashcardQueryRestored");

      getDashboardCard().findByText("42");
    });
  });

  describe("saving a dashboard that retriggers a non saved query (negative id)", () => {
    it("should stop the ongoing query", () => {
      // this test requires the card to be manually added to the dashboard, as it requires the dashcard id to be negative
      cy.createNativeQuestion(questionDetails);

      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        cy.visit(`/dashboard/${dashboardId}`);
      });

      editDashboard();

      openQuestionsSidebar();
      slowDownCardQuery();
      sidebar().findByText(questionDetails.name).click();

      setFilter("Number", "Equal to");
      sidebar().findByText("No default").click();
      popover().findByPlaceholderText("Enter a number").type(1);
      popover().findByText("Add filter").click();

      cy.window().then(win => {
        cy.spy(win.XMLHttpRequest.prototype, "abort").as("xhrAbort");
      });

      getDashboardCard().findByText("Select…").click();
      popover().contains(filterDisplayName).eq(0).click();

      saveDashboard();

      cy.get("@xhrAbort").should("have.been.calledOnce");
    });
  });
});

function slowDownCardQuery() {
  cy.intercept("POST", "api/card/*/query", req => {
    req.on("response", res => {
      res.setDelay(300000);
    });
  }).as("cardQuerySlowed");
}

function slowDownDashcardQuery() {
  cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query", req => {
    req.on("response", res => {
      res.setDelay(5000);
    });
  }).as("dashcardQuerySlowed");
}

function restoreDashcardQuery() {
  cy.intercept("POST", "api/dashboard/*/dashcard/*/card/*/query", req => {
    // calling req.continue() will make cypress skip all previously added intercepts
    req.continue();
  }).as("dashcardQueryRestored");
}

function removeCard() {
  editDashboard();

  showDashboardCardActions();

  cy.findByTestId("dashboardcard-actions-panel")
    .findByLabelText("close icon")
    .click();
}

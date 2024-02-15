import {
  addTextBox,
  editDashboard,
  getDashboardCard,
  openQuestionsSidebar,
  popover,
  removeDashboardCard,
  restore,
  saveDashboard,
  setFilter,
  showDashboardCardActions,
  sidebar,
  undo,
  visitDashboard,
} from "e2e/support/helpers";

const filterDisplayName = "F";
const queryResult = 42;
const parameterValue = 10;
const questionDetails = {
  name: "Question 1",
  native: {
    query: `SELECT ${queryResult} [[+{{F}}]] as ANSWER`,
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

      setupAbortSpy();

      removeCard();

      cy.get("@fetchAbort").should("have.been.calledOnce");
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

      getDashboardCard().findByText(queryResult);
    });

    it("should not break virtual cards (metabase#35545)", () => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      });

      addTextBox("Text card content");

      removeDashboardCard();

      undo();

      getDashboardCard().findByText("Text card content");
    });
  });

  describe("saving a dashboard that retriggers a non saved query (negative id)", () => {
    it("should stop the ongoing query", () => {
      // this test requires the card to be manually added to the dashboard, as it requires the dashcard id to be negative
      cy.createNativeQuestion(questionDetails);

      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
      });

      editDashboard();

      openQuestionsSidebar();
      // when the card is added to a dashboard, it doesn't use the dashcard endpoint but instead uses the card one
      slowDownCardQuery("cardQuerySlowed");
      sidebar().findByText(questionDetails.name).click();

      setFilter("Number", "Equal to");
      sidebar().findByText("No default").click();
      popover().findByPlaceholderText("Enter a number").type(parameterValue);
      popover().findByText("Add filter").click();

      setupAbortSpy();

      getDashboardCard().findByText("Select…").click();
      popover().contains(filterDisplayName).eq(0).click();

      saveDashboard();

      // we abort the card query and the dashcard query
      cy.get("@fetchAbort").should("have.been.calledTwice");

      getDashboardCard().findByText(queryResult + parameterValue);
    });
  });
});

function slowDownCardQuery(as) {
  cy.intercept("POST", "/api/card/*/query", req => {
    req.on("response", res => {
      res.setDelay(300000);
    });
  }).as(as);
}

function slowDownDashcardQuery() {
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
    req.on("response", res => {
      res.setDelay(5000);
    });
  }).as("dashcardQuerySlowed");
}

function restoreDashcardQuery() {
  cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query", req => {
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

function setupAbortSpy() {
  cy.window().then(win => {
    cy.spy(win.AbortController.prototype, "abort").as("fetchAbort");
  });
}

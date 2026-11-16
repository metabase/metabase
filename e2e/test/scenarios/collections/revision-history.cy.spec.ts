const { H } = cy;
import type { USERS } from "e2e/support/cypress_data";
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

type User = keyof typeof USERS;

const CURATE_USERS: User[] = ["admin", "normal", "nodata"];
const VIEW_USERS: User[] = ["readonly"];

describe("revision history", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    H.restore();
  });

  describe("curate access", () => {
    CURATE_USERS.forEach((user) => {
      describe(`${user} user`, () => {
        beforeEach(() => {
          cy.signInAsAdmin();
          // Generate some history for the question
          cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
            name: "Orders renamed",
          });

          if (user !== "admin") {
            cy.signIn(user);
          }
        });

        it("shouldn't create a rearrange revision when adding a card (metabase#6884)", () => {
          cy.intercept("GET", "/api/dashboard/*").as("fetchDashboard");
          cy.intercept("POST", "/api/card/*/query").as("cardQuery");

          H.createDashboard().then(({ body }) => {
            H.visitDashboard(body.id);
            H.editDashboard();
          });

          H.openQuestionsSidebar();
          H.sidebar().findByText("Orders, Count").click();
          cy.wait("@cardQuery");
          H.saveDashboard();

          // this is dirty, but seems like the only reliable way
          // to wait until SET_DASHBOARD_EDITING is dispatched,
          // so it doesn't close the revisions sidebar
          cy.wait("@fetchDashboard");
          cy.wait(100);

          openRevisionHistory();
          H.sidesheet().within(() => {
            cy.findAllByTestId("revision-history-event").should(
              "have.length",
              2,
            );
            cy.findByText(/added a card/).should("be.visible");
            cy.findByText(/rearranged the cards/).should("not.exist");
          });
        });

        it("should be able to revert a dashboard (metabase#15237)", () => {
          H.visitDashboard(ORDERS_DASHBOARD_ID);
          openRevisionHistory();
          clickRevert(/created this/);

          cy.wait("@revert").then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            expect(response?.body.cause).not.to.exist;
          });

          cy.log(
            "We reverted the dashboard to the state prior to adding any cards to it",
          );
          cy.findByTestId("dashboard-empty-state").should("exist");

          cy.log("Should be able to revert back again");
          cy.findByTestId("dashboard-history-list").should(
            "contain",
            "You reverted to an earlier version.",
          );
          clickRevert(/added a card/);

          cy.wait("@revert").then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            expect(response?.body.cause).not.to.exist;
          });

          cy.findByTestId("visualization-root").should("contain", "117.03");
        });

        it("should be able to revert a question", () => {
          cy.skipOn(user === "nodata");

          H.visitQuestion(ORDERS_QUESTION_ID);
          cy.findByTestId("saved-question-header-title").should(
            "have.value",
            "Orders renamed",
          );

          H.questionInfoButton().click();
          H.sidesheet().within(() => {
            cy.findByTestId("question-revert-button").click();
          });

          cy.wait("@revert").then(({ response }) => {
            expect(response?.statusCode).to.eq(200);
            expect(response?.body.cause).not.to.exist;
          });

          cy.findByTestId("saved-question-header-title").should(
            "have.value",
            "Orders",
          );
        });
      });
    });
  });

  describe("view access", () => {
    VIEW_USERS.forEach((user) => {
      describe(`${user} user`, () => {
        it("should see the question and dashboard revision history", () => {
          cy.signInAsAdmin();
          cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
            name: "Orders renamed",
          });
          cy.signIn(user);

          H.visitDashboard(ORDERS_DASHBOARD_ID);
          openRevisionHistory();
          H.sidesheet()
            .findAllByTestId("revision-history-event")
            .should("have.length.gte", 2);

          H.visitQuestion(ORDERS_QUESTION_ID);
          H.questionInfoButton().click();
          H.sidesheet()
            .findAllByTestId("revision-history-event")
            .should("have.length.gte", 2);
        });
      });
    });
  });
});

function clickRevert(eventName: RegExp) {
  cy.findAllByLabelText(eventName).first().click();
}

function openRevisionHistory() {
  cy.intercept("GET", "/api/revision*").as("revisionHistory");

  cy.findByTestId("dashboard-header")
    .findByLabelText("More info")
    .should("be.visible")
    .click();

  H.sidesheet().within(() => {
    cy.wait("@revisionHistory");
    cy.findByTestId("dashboard-history-list").should("be.visible");
  });
}

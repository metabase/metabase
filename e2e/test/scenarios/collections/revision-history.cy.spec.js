import { onlyOn } from "@cypress/skip-test";

import {
  ORDERS_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visitDashboard,
  saveDashboard,
  visitQuestion,
  questionInfoButton,
  rightSidebar,
  openQuestionsSidebar,
} from "e2e/support/helpers";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("revision history", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    restore();
  });

  describe("reproductions", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("shouldn't render revision history steps when there was no diff (metabase#1926)", () => {
      cy.createDashboard().then(({ body }) => {
        visitAndEditDashboard(body.id);
      });

      // Save the dashboard without any changes made to it (TODO: we should probably disable "Save" button in the first place)
      saveDashboard();
      cy.icon("pencil").click();
      saveDashboard();

      openRevisionHistory();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/created this/);

      cy.findAllByText("Revert").should("not.exist");
    });
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach(user => {
        // This function `onlyOn` will not generate tests for any other condition.
        // It helps to make both our tests and Cypress runner sidebar clean
        onlyOn(permission === "curate", () => {
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
              cy.createDashboard().then(({ body }) => {
                visitAndEditDashboard(body.id);
              });
              openQuestionsSidebar();
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("Orders, Count").click();
              saveDashboard();
              openRevisionHistory();
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText(/added a card/)
                .siblings("button")
                .should("not.exist");
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText(/rearranged the cards/).should("not.exist");
            });

            // skipped because it's super flaky in CI
            it.skip("should be able to revert a dashboard (metabase#15237)", () => {
              visitDashboard(ORDERS_DASHBOARD_ID);
              openRevisionHistory();
              clickRevert(/created this/);

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              // We reverted the dashboard to the state prior to adding any cards to it
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("This dashboard is looking empty.");

              // Should be able to revert back again
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("History");
              clickRevert(/added a card/);

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("117.03");
            });

            it("should be able to access the question's revision history via the revision history button in the header of the query builder", () => {
              cy.skipOn(user === "nodata");

              visitQuestion(ORDERS_QUESTION_ID);

              cy.findByTestId("revision-history-button").click();

              cy.findByTestId("question-revert-button").click();

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.contains(/^Orders$/);
            });

            it("should be able to revert the question via the action button found in the saved question timeline", () => {
              cy.skipOn(user === "nodata");

              visitQuestion(ORDERS_QUESTION_ID);

              questionInfoButton().click();
              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.findByText("History").click();
              // Last revert is the original state
              cy.findAllByTestId("question-revert-button").last().click();

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
              cy.contains(/^Orders$/);
            });
          });
        });

        onlyOn(permission === "view", () => {
          describe(`${user} user`, () => {
            it("should not see question nor dashboard revert buttons (metabase#13229)", () => {
              cy.signIn(user);

              visitDashboard(ORDERS_DASHBOARD_ID);
              openRevisionHistory();
              cy.findAllByRole("button", { name: "Revert" }).should(
                "not.exist",
              );

              visitQuestion(ORDERS_QUESTION_ID);
              cy.findByRole("button", { name: /Edited .*/ }).click();

              cy.findAllByRole("button", { name: "Revert" }).should(
                "not.exist",
              );
            });
          });
        });
      });
    });
  });
});

function clickRevert(event_name, index = 0) {
  cy.findAllByLabelText(event_name).eq(index).click();
}

function visitAndEditDashboard(id) {
  visitDashboard(id);
  cy.icon("pencil").click();
}

function openRevisionHistory() {
  cy.intercept("GET", "/api/revision*").as("revisionHistory");
  cy.findByTestId("dashboard-header").within(() => {
    cy.icon("info").click();
  });
  cy.wait("@revisionHistory");

  rightSidebar().within(() => {
    cy.findByText("History");
    cy.findByTestId("dashboard-history-list").should("be.visible");
  });
}

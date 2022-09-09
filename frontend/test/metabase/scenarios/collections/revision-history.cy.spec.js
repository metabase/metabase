import {
  restore,
  visitDashboard,
  saveDashboard,
  visitQuestion,
  questionInfoButton,
  rightSidebar,
} from "__support__/e2e/helpers";

import { onlyOn } from "@cypress/skip-test";

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

      cy.findByText(/created this/);

      cy.findAllByText("Revert").should("not.exist");
    });

    it.skip("dashboard should update properly on revert (metabase#6884)", () => {
      visitAndEditDashboard(1);
      // Add another question without changing its size or moving it afterwards
      cy.icon("add").last().click();
      cy.findByText("Orders, Count").click();
      saveDashboard();
      // Revert the card to the state when the second card was added
      cy.icon("ellipsis").click();
      cy.findByText("Revision history").click();
      clickRevert("added a card.", 0); // the top-most string or the latest card addition
      cy.wait("@revert");
      cy.request("GET", "/api/dashboard/1").then(xhr => {
        const SECOND_CARD = xhr.body.ordered_cards[1];
        const { col, size_x, size_y } = SECOND_CARD;
        // The second card shrunk its size and changed the position completely to the left covering the first one
        expect(col).not.to.eq(0);
        expect(size_x).to.eq(4);
        expect(size_y).to.eq(4);
      });
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
              cy.request("PUT", "/api/card/1", {
                name: "Orders renamed",
              });

              if (user !== "admin") {
                cy.signIn(user);
              }
            });

            it("should be able to revert a dashboard (metabase#15237)", () => {
              visitDashboard(1);
              openRevisionHistory();
              clickRevert(/created this/);

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              // We reverted the dashboard to the state prior to adding any cards to it
              cy.findByText("This dashboard is looking empty.");

              // Should be able to revert back again
              cy.findByText("History");
              clickRevert(/rearranged the cards/);

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              cy.findByText("117.03");
            });

            it("should be able to access the question's revision history via the revision history button in the header of the query builder", () => {
              cy.skipOn(user === "nodata");

              visitQuestion(1);

              cy.findByTestId("revision-history-button").click();

              cy.findByTestId("question-revert-button").click();

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              cy.contains(/^Orders$/);
            });

            it("should be able to revert the question via the action button found in the saved question timeline", () => {
              cy.skipOn(user === "nodata");

              visitQuestion(1);

              questionInfoButton().click();
              cy.findByText("History").click();
              // Last revert is the original state
              cy.findAllByTestId("question-revert-button").last().click();

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              cy.contains(/^Orders$/);
            });
          });
        });

        onlyOn(permission === "view", () => {
          describe(`${user} user`, () => {
            it("should not see question nor dashboard revert buttons (metabase#13229)", () => {
              cy.signIn(user);

              visitDashboard(1);
              openRevisionHistory();
              cy.findAllByRole("button", { name: "Revert" }).should(
                "not.exist",
              );

              visitQuestion(1);
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
  cy.findAllByText(event_name).eq(index).siblings("button").first().click();
}

function visitAndEditDashboard(id) {
  visitDashboard(id);
  cy.icon("pencil").click();
}

function openRevisionHistory() {
  cy.get("main header").within(() => {
    cy.icon("info").click();
  });
  rightSidebar().within(() => {
    cy.findByText("History");
  });
}

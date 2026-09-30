const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { onlyOn } from "e2e/support/helpers/e2e-skip-test-helpers";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("revision history", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/revision/revert").as("revert");

    H.restore();
  });

  describe("reproductions", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("shouldn't render revision history steps when there was no diff (metabase#1926)", () => {
      H.createDashboard().then(({ body }) => {
        H.visitDashboard(body.id);
        H.editDashboard();
      });

      // Save the dashboard without any changes made to it (TODO: we should probably disable "Save" button in the first place)
      H.saveDashboard({ awaitRequest: false });
      H.editDashboard();
      H.saveDashboard({ awaitRequest: false });

      openRevisionHistory();

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText(/created this/);

      cy.findAllByText("Revert").should("not.exist");
    });
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach((user) => {
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
                cy.findByRole("tab", { name: "History" }).click();
                cy.findByText(/added a card/)
                  .siblings("button")
                  .should("not.exist");
                cy.findByText(/rearranged the cards/).should("not.exist");
              });
            });

            it("should be able to revert a dashboard (metabase#15237)", () => {
              H.visitDashboard(ORDERS_DASHBOARD_ID);
              openRevisionHistory();
              clickRevert(/created this/);

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
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

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              cy.findByTestId("visualization-root").should("contain", "117.03");
            });

            it("should be able to access the question's revision history via the header button and the info sidesheet, and revert the question", () => {
              cy.skipOn(user === "nodata");

              H.visitQuestion(ORDERS_QUESTION_ID);

              cy.log("open revision history via the header button");
              cy.findByTestId("revision-history-button").click();
              H.sidesheet().within(() => {
                cy.findByRole("tab", { name: "History" }).should(
                  "have.attr",
                  "aria-selected",
                  "true",
                );
                cy.findByTestId("question-revert-button").should("be.visible");
              });
              H.sidesheet().findByLabelText("Close").click();
              H.sidesheet().should("not.exist");

              cy.log("open revision history via the question info sidesheet");
              H.questionInfoButton().click();
              H.sidesheet().within(() => {
                cy.findByRole("tab", { name: "History" }).click();
                cy.findByTestId("question-revert-button").click();
              });

              cy.wait("@revert").then(({ response: { statusCode, body } }) => {
                expect(statusCode).to.eq(200);
                expect(body.cause).not.to.exist;
              });

              cy.findByTestId("saved-question-header-title").should(
                "have.value",
                "Orders",
              );
            });
          });
        });

        onlyOn(permission === "view", () => {
          describe(`${user} user`, () => {
            it("should not see question nor dashboard revert buttons (metabase#13229)", () => {
              cy.signIn(user);

              H.visitDashboard(ORDERS_DASHBOARD_ID);
              openRevisionHistory();
              cy.findAllByRole("button", { name: "Revert" }).should(
                "not.exist",
              );

              H.visitQuestion(ORDERS_QUESTION_ID);
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
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  cy.findAllByLabelText(event_name).eq(index).click();
}

function openRevisionHistory() {
  cy.intercept("GET", "/api/revision*").as("revisionHistory");

  cy.findByTestId("dashboard-header")
    .findByLabelText("More info")
    .should("be.visible")
    .click();

  H.sidesheet().within(() => {
    cy.findByRole("tab", { name: "History" }).click();
    cy.wait("@revisionHistory");

    cy.findByRole("tab", { name: "History" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.findByTestId("dashboard-history-list").should("be.visible");
  });
}

const { H } = cy;
import {
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { onlyOn } from "e2e/support/helpers/e2e-skip-test-helpers";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
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

      H.sidesheet().within(() => {
        cy.findAllByTestId("revision-history-event")
          .should("have.length", 1)
          .and("contain.text", "created this");
        cy.findByTestId("question-revert-button").should("not.exist");
      });
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
              cy.findByTestId("saved-question-header-title").should(
                "have.value",
                "Orders renamed",
              );

              cy.log("open revision history via the header button");
              cy.findByTestId("revision-history-button").click();
              H.sidesheet().within(() => {
                cy.findByRole("tab", { name: "History" }).click();
                // The revert button only becomes visible on hover
                cy.findByTestId("question-revert-button").should("exist");
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
              cy.signInAsAdmin();
              cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
                name: "Orders renamed",
              });
              cy.signIn(user);

              H.visitDashboard(ORDERS_DASHBOARD_ID);
              openRevisionHistory();
              H.sidesheet().within(() => {
                cy.findAllByTestId("revision-history-event").should(
                  "have.length.gte",
                  2,
                );
                cy.findByTestId("question-revert-button").should("not.exist");
              });

              H.visitQuestion(ORDERS_QUESTION_ID);
              H.questionInfoButton().click();
              H.sidesheet().within(() => {
                cy.findByRole("tab", { name: "History" }).click();
                cy.findAllByTestId("revision-history-event").should(
                  "have.length.gte",
                  2,
                );
                cy.findByTestId("question-revert-button").should("not.exist");
              });
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

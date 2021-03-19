import { onlyOn } from "@cypress/skip-test";
import { restore } from "__support__/cypress";

const PERMISSIONS = {
  curate: ["admin", "normal", "nodata"],
  view: ["readonly"],
  no: ["nocollection", "nosql", "none"],
};

describe("collection permissions", () => {
  beforeEach(() => {
    restore();
    cy.server();
  });

  describe("item management", () => {
    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach(user => {
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
              });

              it.skip("should be able to duplicate the dashboard without obstructions from the modal (metabase#15256)", () => {
                cy.visit("/collection/root");
                openEllipsisMenuFor("Orders in a dashboard");
                cy.findByText("Duplicate this item").click();
                cy.get(".Modal")
                  .as("modal")
                  .within(() => {
                    cy.findByRole("button", { name: "Duplicate" })
                      .should("not.be.disabled")
                      .click();
                    cy.findByText("Failed").should("not.exist");
                  });
                cy.get("@modal").should("not.exist");
                cy.findByText("Orders in a dashboard - Duplicate");
              });

              describe("managing question from the question's edit dropdown (metabase#11719)", () => {
                beforeEach(() => {
                  cy.route("PUT", "/api/card/1").as("updateQuestion");
                  cy.visit("/question/1");
                  cy.icon("pencil").click();
                });

                it("should be able to edit question details (metabase#11719-1)", () => {
                  cy.skipOn(user === "nodata");
                  cy.findByText("Edit this question").click();
                  cy.findByLabelText("Name")
                    .click()
                    .type("1");
                  clickButton("Save");
                  assertOnQuestionUpdate();
                  cy.findByText("Orders1");
                });

                it("should be able to move the question (metabase#11719-2)", () => {
                  cy.skipOn(user === "nodata");
                  cy.findByText("Move").click();
                  cy.findByText("My personal collection").click();
                  clickButton("Move");
                  assertOnQuestionUpdate();
                  cy.contains("37.65");
                });

                it("should be able to archive the question (metabase#11719-3)", () => {
                  cy.findByText("Archive").click();
                  clickButton("Archive");
                  assertOnQuestionUpdate();
                  cy.location("pathname").should("eq", "/collection/root");
                  cy.findByText("Orders").should("not.exist");
                });

                /**
                 * Custom function related to this describe block only
                 */
                function assertOnQuestionUpdate() {
                  cy.wait("@updateQuestion").then(xhr => {
                    expect(xhr.status).not.to.eq(403);
                  });
                  cy.findByText(
                    "Sorry, you don’t have permission to see that.",
                  ).should("not.exist");
                  cy.get(".Modal").should("not.exist");
                }
              });
            });
          });
        });
      });
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      cy.route("POST", "/api/revision/revert").as("revert");
    });

    Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
      context(`${permission} access`, () => {
        userGroup.forEach(user => {
          // This function `onlyOn` will not generate tests for any other condition.
          // It helps to make both our tests and Cypress runner sidebar clean
          onlyOn(permission === "curate", () => {
            describe(`${user} user`, () => {
              beforeEach(() => {
                cy.signIn(user);
              });

              it.skip("should be able to revert the dashboard (metabase#15237)", () => {
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                cy.findByText("Revision history").click();
                clickRevert("First revision.");
                cy.wait("@revert").then(xhr => {
                  expect(xhr.status).to.eq(200);
                  expect(xhr.cause).not.to.exist;
                });
                cy.findAllByText(/Revert/).should("not.exist");
                // We reverted the dashboard to the state prior to adding any cards to it
                cy.findByText("This dashboard is looking empty.");
              });
            });
          });

          onlyOn(permission === "view", () => {
            describe(`${user} user`, () => {
              it.skip("should not see revert buttons (metabase#13229)", () => {
                cy.signIn(user);
                cy.visit("/dashboard/1");
                cy.icon("ellipsis").click();
                cy.findByText("Revision history").click();
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
});

function clickRevert(event_name) {
  cy.findByText(event_name)
    .closest("tr")
    .findByText(/Revert/i)
    .click();
}

function openEllipsisMenuFor(item, index = 0) {
  cy.findAllByText(item)
    .eq(index)
    .closest("a")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

function clickButton(name) {
  cy.findByRole("button", { name })
    .should("not.be.disabled")
    .click();
}

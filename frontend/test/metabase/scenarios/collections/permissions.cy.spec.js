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

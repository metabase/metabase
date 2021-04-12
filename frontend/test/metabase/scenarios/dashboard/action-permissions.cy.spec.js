import { onlyOn } from "@cypress/skip-test";
import { restore, popover } from "__support__/cypress";

// TODO Add other permissions
const PERMISSIONS = {
  curate: ["admin", "normal"],
  view: ["readonly"],
};

describe("dashboard action permissions", () => {
  beforeEach(() => {
    restore();
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach(user => {
        beforeEach(() => {
          cy.signIn(user);
          cy.visit("/dashboard/1");
        });

        describe(`${user} user`, () => {
          onlyOn(permission === "curate", () => {
            it("should be able to duplicate dashboard", () => {
              ellipsisMenuPopover().within(() => {
                cy.findByText("Duplicate").click();
              });
              cy.get(".Modal")
                .as("modal")
                .within(() => {
                  cy.findByRole("button", { name: "Duplicate" }).click();
                  cy.findByText("Failed").should("not.exist");
                });
              cy.get("@modal").should("not.exist");
              cy.findByText("Orders in a dashboard - Duplicate");
            });
          });

          onlyOn(permission === "view", () => {
            it("should not be offered to duplicate dashboard in collections they have `read` access to", () => {
              ellipsisMenuPopover().within(() => {
                cy.findByText("Duplicate").should("not.exist");
              });
            });
          });
        });
      });
    });
  });
});

function ellipsisMenuPopover() {
  cy.icon("ellipsis").click();
  return popover();
}

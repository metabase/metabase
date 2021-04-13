import { onlyOn } from "@cypress/skip-test";
import { restore, popover } from "__support__/cypress";

// TODO Add other permissions
const PERMISSIONS = {
  curate: ["admin", "normal"],
  view: ["readonly"],
};

describe("question action permissions", () => {
  beforeEach(() => {
    restore();
  });

  Object.entries(PERMISSIONS).forEach(([permission, userGroup]) => {
    context(`${permission} access`, () => {
      userGroup.forEach(user => {
        beforeEach(() => {
          cy.signIn(user);
          cy.visit("/question/1");
        });

        describe(`${user} user`, () => {
          describe("adding question to dashboard", () => {
            onlyOn(permission === "curate", () => {
              it("should list collections user has `write` access to", () => {
                actionsMenuPopover()
                  .findByText("Add to dashboard")
                  .click();
                cy.get(".Modal")
                  .findByText("First collection")
                  .should("exist");
              });
            });

            onlyOn(permission === "view", () => {
              it("should hide collections user has only `read` access to", () => {
                actionsMenuPopover()
                  .findByText("Add to dashboard")
                  .click();
                cy.get(".Modal")
                  .findByText("First collection")
                  .should("not.exist");
              });
            });

            it("should be able to add question to dashboard", () => {
              actionsMenuPopover()
                .findByText("Add to dashboard")
                .click();
              cy.get(".Modal")
                .as("modal")
                .findByText("Orders in a dashboard")
                .click();

              cy.get("@modal").should("not.exist");
              // By default, the dashboard contains one question
              // After we add a new one, we check there are two questions now
              cy.get(".DashCard").should("have.length", 2);
            });
          });
        });
      });
    });
  });
});

function actionsMenuPopover() {
  cy.icon("pencil").click();
  return popover();
}

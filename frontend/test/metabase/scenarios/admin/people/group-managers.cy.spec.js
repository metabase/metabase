import _ from "underscore";
import { restore, modal, popover, describeEE } from "__support__/e2e/helpers";

describeEE("scenarios > admin > people", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.visit("/admin/people");
    cy.findByText("Robert Tableton")
      .closest("tr")
      .findByText("2 other groups")
      .click();

    cy.findAllByTestId("user-type-toggle").click({ multiple: true });

    cy.signInAsNormalUser();
    cy.visit("/");
    cy.icon("gear").click();
    cy.findByText("Admin settings").click();
  });

  describe("group managers", () => {
    it("can manage groups from the group page", () => {
      cy.get(".AdminList").within(() => {
        cy.findByTextEnsureVisible("Groups").click();
      });

      // Edit group name
      cy.icon("ellipsis").eq(0).click();
      cy.findByText("Edit Name").click();
      cy.get("input").type(" updated");
      cy.button("Done").click();

      // Click on the group with the new name
      cy.findByText("collection updated").click();

      // Add "No Collection Tableton" member
      cy.button("Add members").click();
      cy.focused().type("No");
      cy.findByText("No Collection Tableton").click();
      cy.findByText("Add").click();

      // Find user row
      cy.findByText("No Collection Tableton").closest("tr").as("userRow");

      // Promote to manager and demote back to member
      cy.get("@userRow").within(() => {
        cy.findByText("Member").realHover();
        cy.findAllByTestId("user-type-toggle").click();

        cy.findByText("Manager").realHover();
        cy.findAllByTestId("user-type-toggle").click();

        cy.findByText("Member");
      });

      // Delete the user
      cy.get("@userRow").within(() => {
        cy.icon("close").click();
      });
      cy.findByText("No Collection Tableton").should("not.exist");

      // Demote myself
      cy.findByText("Robert Tableton")
        .closest("tr")
        .within(() => {
          cy.findByText("Manager").realHover();
          cy.findAllByTestId("user-type-toggle").click();
        });
      confirmLosingAbilityToManageGroup();

      // Redirected to the groups list
      cy.url().should("match", /\/admin\/people\/groups$/);

      // Open another group
      cy.findByText("data").click();

      // Remove myself
      cy.findByText("Robert Tableton")
        .closest("tr")
        .within(() => {
          cy.icon("close").click();
        });
      confirmLosingAbilityToManageGroup();

      // Redirected to the home page
      cy.url().should("match", /\/$/);
    });

    it("can manage members from the people page", () => {
      // Open membership select for a user
      cy.findByText("No Collection Tableton")
        .closest("tr")
        .as("userRow")
        .within(() => {
          cy.findByText("data").click();
        });

      // Add the user to a group
      popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("2 other groups");
      });

      // Remove the user from the group
      popover().within(() => {
        cy.findByText("collection").click();
      });
      cy.get("@userRow").within(() => {
        cy.findByText("data");
      });

      // Promote and then demote the user
      popover().within(() => {
        cy.icon("arrow_up").click();
        cy.icon("arrow_down").click();
      });

      // Find own row
      cy.findByText("Robert Tableton")
        .closest("tr")
        .within(() => {
          cy.findByText("2 other groups").click();
        });

      // Demote myself from being manager
      popover().within(() => {
        cy.icon("arrow_down").eq(0).click();
      });
      confirmLosingAbilityToManageGroup();

      // Remove myself from another group
      popover().within(() => {
        cy.findByText("data").click();
      });
      confirmLosingAbilityToManageGroup();

      // Redirected to the home page
      cy.url().should("match", /\/$/);
    });
  });

  it("after removing the last group redirects to the home page", () => {
    cy.findByTextEnsureVisible("Groups").click();

    removeFirstGroup();
    cy.url().should("match", /\/admin\/people\/groups$/);

    removeFirstGroup();
    cy.url().should("match", /\/$/);
  });
});

function confirmLosingAbilityToManageGroup() {
  modal().within(() => {
    cy.findByText(
      "You will not be able to manage users of this group anymore.",
    );
    cy.button("Confirm").click();
  });
}

function removeFirstGroup() {
  cy.icon("ellipsis").eq(0).click();
  cy.findByText("Remove Group").click();
  cy.button("Yes").click();
}

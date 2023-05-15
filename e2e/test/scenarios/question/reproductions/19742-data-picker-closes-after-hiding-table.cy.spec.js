import { restore, popover, openNavigationSidebar } from "e2e/support/helpers";

describe("issue 19742", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // In order to reproduce the issue, it's important to only use in-app links
  // and don't refresh the app state (like by doing cy.visit)
  it("shouldn't auto-close the data selector after a table was hidden", () => {
    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    selectFromDropdown("Question");
    selectFromDropdown("Sample Database");

    openNavigationSidebar();
    cy.icon("gear").click();
    selectFromDropdown("Admin settings");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Data Model").click();
    hideTable("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exit admin").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    selectFromDropdown("Question");
    selectFromDropdown("Sample Database");

    popover().within(() => {
      cy.findByText("Products");
      cy.findByText("Reviews");
      cy.findByText("People");
      cy.findByText("Orders").should("not.exist");
    });
  });
});

function selectFromDropdown(optionName) {
  popover().findByText(optionName).click();
}

function hideTable(tableName) {
  cy.findByText(tableName).find(".Icon-eye_crossed_out").click({ force: true });
}

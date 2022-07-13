import {
  restore,
  popover,
  openNavigationSidebar,
} from "__support__/e2e/helpers";

describe("issue 19742", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // In order to reproduce the issue, it's important to only use in-app links
  // and don't refresh the app state (like by doing cy.visit)
  it("shouldn't auto-close the data selector after a table was hidden", () => {
    cy.visit("/");
    cy.findByText("New").click();
    selectFromDropdown("Question");
    selectFromDropdown("Sample Database");

    openNavigationSidebar();
    cy.icon("gear").click();
    selectFromDropdown("Admin settings");

    cy.findByText("Data Model").click();
    hideTable("Orders");
    cy.findByText("Exit admin").click();

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

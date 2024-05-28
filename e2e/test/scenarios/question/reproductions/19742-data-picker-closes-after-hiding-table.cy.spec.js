import {
  restore,
  popover,
  openNavigationSidebar,
  entityPickerModal,
  entityPickerModalTab,
} from "e2e/support/helpers";

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

    popover().findByText("Question").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").should("exist");
      cy.button("Close").click();
    });

    openNavigationSidebar();
    cy.icon("gear").click();
    selectFromDropdown("Admin settings");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata").click();
    hideTable("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exit admin").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();

      cy.findByText("Orders").should("not.exist");
      cy.findByText("Products").should("exist");
      cy.findByText("Reviews").should("exist");
      cy.findByText("People").should("exist");
    });
  });
});

function selectFromDropdown(optionName) {
  popover().findByText(optionName).click();
}

function hideTable(tableName) {
  cy.findByText(tableName).find(".Icon-eye_crossed_out").click({ force: true });
}

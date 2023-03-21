import {
  restore,
  popover,
  isEE,
  typeAndBlurUsingLabel,
} from "e2e/support/helpers";

describe("scenarios > admin > databases > add", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show validation error if you enter invalid db connection info", () => {
    cy.intercept("POST", "/api/database").as("createDatabase");

    // should display a setup help card
    cy.visit("/admin/databases/create");
    cy.findByText("Need help connecting?");

    chooseDatabase("H2");
    typeAndBlurUsingLabel("Display name", "Test");
    typeAndBlurUsingLabel("Connection String", "invalid");

    cy.button("Save").click();
    cy.wait("@createDatabase");
    cy.findByText(": check your connection string");
    cy.findByText("Implicitly relative file paths are not allowed.");
  });

  it("EE should ship with Oracle and Vertica as options", () => {
    cy.onlyOn(isEE);

    cy.visit("/admin/databases/create");
    cy.findByLabelText("Database type").click();
    popover().within(() => {
      cy.findByText("Oracle");
      cy.findByText("Vertica");
    });
  });
});

function selectFieldOption(fieldName, option) {
  cy.findByLabelText(fieldName).click();
  popover().contains(option).click({ force: true });
}

function chooseDatabase(database) {
  selectFieldOption("Database type", database);
}

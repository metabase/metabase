import { restore, popover } from "__support__/e2e/helpers";

describe("admin > database > add > Presto", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.visit("/admin/databases/create");
    cy.contains("Database type").closest(".Form-field").find("a").click();
  });

  it("should render correctly and allow switching between the new and the old drivers (metabase#18351)", () => {
    // There should be only the new driver listed originally in the popover
    popover().within(() => {
      cy.findByText("Presto (Deprecated Driver)").should("not.exist");
      cy.findByText("Presto").click();
    });

    cy.findByLabelText("Display name").type("Foo");

    /**
     *  No need to fill out all these fields, because we can't connect to Presto from Cypress.
     * Just making sure they are all there.
     */
    cy.findByLabelText("Host");
    cy.findByLabelText("Port");
    cy.findByLabelText("Catalog");
    cy.findByLabelText("Schema (optional)");
    cy.findByLabelText("Username");
    cy.findByLabelText("Password");
    // Implicit assertion - reproduces metabase#18351
    cy.findByText("Show advanced options").click();
    cy.findByLabelText("Additional JDBC options");

    cy.findByLabelText("Use a secure connection (SSL)");
    cy.findByLabelText("Authenticate with Kerberos");
    // Turned on by default
    cy.findByLabelText("Rerun queries for simple explorations").should(
      "have.attr",
      "aria-checked",
      "true",
    );

    cy.findByLabelText("Choose when syncs and scans happen").should(
      "have.attr",
      "aria-checked",
      "",
    );

    cy.findByLabelText("Periodically refingerprint tables").should(
      "have.attr",
      "aria-checked",
      "",
    );

    // This should be disabled but we'll not add that assertion until we mark all the required fields in the form
    cy.button("Save");

    cy.findByText("Need help connecting?");

    cy.contains("This is our new Presto driver.");

    // Switch to the deprecated old Presto driver
    cy.contains(
      "The old driver has been deprecated and will be removed in a future release. If you really need to use it, you can find it here.",
    )
      .find("a")
      .click();

    cy.findAllByTestId("select-button").contains("Presto (Deprecated Driver)");

    // It should have persisted the previously set database name
    cy.findByDisplayValue("Foo");

    cy.findByLabelText("Host");
    cy.findByLabelText("Port");
    cy.findByLabelText("Catalog");
    cy.findByLabelText("Database name").should("not.exist");
    cy.findByLabelText("Schema (optional)").should("not.exist");
    cy.findByLabelText("Username");
    cy.findByLabelText("Password");

    // Reproduces metabase#18351
    cy.findByLabelText("Additional JDBC options").should("not.exist");

    cy.findByLabelText("Use a secure connection (SSL)");
    cy.findByLabelText("Use an SSH-tunnel");

    cy.findByLabelText("Rerun queries for simple explorations").should(
      "have.attr",
      "aria-checked",
      "true",
    );

    cy.findByLabelText("Choose when syncs and scans happen").should(
      "have.attr",
      "aria-checked",
      "",
    );

    cy.findByLabelText("Periodically refingerprint tables").should(
      "have.attr",
      "aria-checked",
      "",
    );

    cy.contains("This driver will be removed in a future release. ");

    // Switch back to the new Presto driver
    cy.contains("We recommend you upgrade to the new Presto driver.")
      .find("a")
      .click();

    cy.findAllByTestId("select-button").contains("Presto").click();

    popover()
      .should("contain", "Presto")
      .and("contain", "Presto (Deprecated Driver)");
  });
});

import {
  restore,
  popover,
  describeEE,
  mockSessionProperty,
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

  describeEE("caching", () => {
    beforeEach(() => {
      mockSessionProperty("enable-query-caching", true);

      cy.intercept("POST", "/api/database", { id: 42 }).as("createDatabase");
      cy.visit("/admin/databases/create");

      typeAndBlurUsingLabel("Display name", "Test");
      typeAndBlurUsingLabel("Host", "localhost");
      typeAndBlurUsingLabel("Database name", "db");
      typeAndBlurUsingLabel("Username", "admin");

      cy.findByText("Show advanced options").click();
    });

    it("sets cache ttl to null by default", () => {
      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(null);
      });
    });

    it("allows to set cache ttl", () => {
      cy.findByText("Use instance default (TTL)").click();
      popover().findByText("Custom").click();
      cy.findByDisplayValue("24").clear().type("48").blur();

      cy.button("Save").click();

      cy.wait("@createDatabase").then(({ request }) => {
        expect(request.body.cache_ttl).to.equal(48);
      });
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

import { restore, popover, mockSessionProperty } from "__support__/e2e/cypress";

describe("scenarios > filters > sql filters > basic filter types", () => {
  beforeEach(() => {
    restore();
    cy.intercept("POST", "api/dataset").as("dataset");

    cy.signInAsAdmin();
    // Make sure feature flag is on regardles of the environment where this is running.
    mockSessionProperty("field-filter-operators-enabled?", true);

    cy.visit("/");
    cy.icon("sql").click();
    cy.get(".ace_content")
      .as("editor")
      .should("be.visible");
  });

  describe("should work for text", () => {
    beforeEach(() => {
      enterNativeQuery(
        "SELECT * FROM products WHERE products.category = {{textFilter}}",
      );
    });

    it("when set through the filter widget", () => {
      setFilterWidgetValue("Gizmo");

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });

    it("when set as the default value for a required filter", () => {
      setRequiredFilterDefaultValue("Gizmo");

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Rustic Paper Wallet");
        cy.findAllByText("Doohickey").should("not.exist");
      });
    });
  });

  describe("should work for number", () => {
    beforeEach(() => {
      enterNativeQuery(
        "SELECT * FROM products WHERE products.rating = {{numberFilter}}",
      );

      openPopoverFromDefaultFilterType();
      setFilterType("Number");
    });

    it("when set through the filter widget", () => {
      setFilterWidgetValue("4.3");

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });

    it.skip("when set as the default value for a required filter (metabase#16811)", () => {
      setRequiredFilterDefaultValue("4.3");

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("Aerodynamic Linen Coat");
        cy.findAllByText("4.3");
      });
    });
  });

  describe("should work for date", () => {
    beforeEach(() => {
      enterNativeQuery(
        "SELECT * FROM products WHERE products.created_at = {{dateFilter}}",
      );

      openPopoverFromDefaultFilterType();
      setFilterType("Date");
    });

    it("when set through the filter widget", () => {
      cy.get("fieldset").click();
      // Since we have fixed dates in Sample Dataset (dating back a couple of years), it'd be cumbersome to click back month by month.
      // Instead, let's choose the 15th of the current month and assert that there are no products / no results.
      cy.findByText("15").click();

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("No results!");
      });
    });

    it("when set as the default value for a required filter", () => {
      toggleRequiredFilter();

      cy.findByText("Select a default value…").click();
      cy.findByText("15").click();

      runQuery();

      cy.get(".Visualization").within(() => {
        cy.findByText("No results!");
      });
    });
  });
});

function openPopoverFromSelectedFilterType(filterType) {
  cy.get(".AdminSelect-content")
    .contains(filterType)
    .click();
}

function openPopoverFromDefaultFilterType() {
  openPopoverFromSelectedFilterType("Text");
}

function setFilterType(filterType) {
  popover().within(() => {
    cy.findByText(filterType).click();
  });
}

function runQuery(xhrAlias = "dataset") {
  cy.get(".NativeQueryEditor .Icon-play").click();
  cy.wait("@" + xhrAlias);
  cy.icon("play").should("not.exist");
}

function enterNativeQuery(query) {
  cy.get("@editor").type(query, { parseSpecialCharSequences: false });
}

function setFilterWidgetValue(value) {
  cy.get("fieldset")
    .click()
    .type(value);
}

function toggleRequiredFilter() {
  cy.findByText("Required?")
    .parent()
    .find("a")
    .click();
}

function setRequiredFilterDefaultValue(value) {
  toggleRequiredFilter();
  cy.findByPlaceholderText("Enter a default value...").type(value);
}

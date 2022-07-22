import {
  restore,
  changeBinningForDimension,
  getDimensionByName,
  getRemoveDimensionButton,
  summarize,
  visitQuestion,
} from "__support__/e2e/helpers";

describe("scenarios > question > summarize sidebar", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    visitQuestion(1);
    summarize();
  });

  it("removing all aggregations should show add aggregation button with label", () => {
    cy.findByTestId("aggregation-item").within(() => {
      cy.icon("close").click();
    });

    cy.findByTestId("add-aggregation-button").should(
      "have.text",
      "Add a metric",
    );
  });

  it("selected dimensions becomes pinned to the top of the dimensions list", () => {
    getDimensionByName({ name: "Total" })
      .should("have.attr", "aria-selected", "false")
      .click()
      .should("have.attr", "aria-selected", "true");

    cy.button("Done").click();

    summarize();

    // Removed from the unpinned list
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total").should("not.exist");
    });

    // Displayed in the pinned list
    cy.findByTestId("pinned-dimensions").within(() => {
      cy.findByText("Orders → Total").should("not.exist");
      getDimensionByName({ name: "Total" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    getRemoveDimensionButton({ name: "Total" }).click();

    // Becomes visible in the unpinned list again
    cy.findByTestId("unpinned-dimensions").within(() => {
      cy.findByText("Total");
    });
  });

  it("selected dimensions from another table includes the table name when becomes pinned to the top", () => {
    getDimensionByName({ name: "State" }).click();

    cy.button("Done").click();

    summarize();

    cy.findByTestId("pinned-dimensions").within(() => {
      getDimensionByName({ name: "People → State" }).should(
        "have.attr",
        "aria-selected",
        "true",
      );
    });

    getRemoveDimensionButton({ name: "People → State" }).click();

    cy.findByText("People → State").should("not.exist");
  });

  it("selecting a binning adds a dimension", () => {
    getDimensionByName({ name: "Total" }).click();

    changeBinningForDimension({
      name: "Quantity",
      toBinning: "10 bins",
    });

    getDimensionByName({ name: "Total" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
    getDimensionByName({ name: "Quantity" }).should(
      "have.attr",
      "aria-selected",
      "true",
    );
  });
});

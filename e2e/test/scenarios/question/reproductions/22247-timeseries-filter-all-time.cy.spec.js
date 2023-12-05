import {
  restore,
  popover,
  openProductsTable,
  summarize,
  sidebar,
} from "e2e/support/helpers";

describe("time-series filter widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable();
  });

  it("should properly display All time as the initial filtering (metabase#22247)", () => {
    summarize();

    sidebar().contains("Created At").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();

    popover().within(() => {
      // Implicit assertion: there is only one select button
      cy.findByDisplayValue("All time").should("be.visible");

      cy.button("Apply").should("not.be.disabled");
    });
  });

  it("should allow switching from All time filter", () => {
    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    // switch to previous 30 quarters
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    popover().within(() => {
      cy.findByDisplayValue("All time").click();
    });
    cy.findByTextEnsureVisible("Previous").click();
    cy.findByDisplayValue("days").click();
    cy.findByTextEnsureVisible("quarters").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 30 quarters")
      .should("be.visible");
  });

  it("should stay in-sync with the actual filter", () => {
    cy.findAllByText("Filter").first().click();
    cy.findByTestId("filter-field-Created At").within(() => {
      cy.findByLabelText("more options").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Last 3 Months").click();
    cy.button("Apply Filters").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 months").click();
    cy.findByDisplayValue("months").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("years").click();
    cy.button("Update filter").click();
    cy.wait("@dataset");

    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 3 years")
      .should("be.visible");

    cy.findByTestId("timeseries-filter-button").click();
    popover().within(() => {
      cy.findByDisplayValue("Previous").should("be.visible");
      cy.findByDisplayValue("All time").should("not.exist");
      cy.findByDisplayValue("Next").should("not.exist");
    });

    // switch to All time filter
    popover().within(() => {
      cy.findByDisplayValue("Previous").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 years").should("not.exist");
    cy.findByTextEnsureVisible("All time");
  });
});

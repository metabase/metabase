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
      cy.findByRole("combobox").invoke("text").should("eq", "All time");

      cy.button("Apply").should("not.be.disabled");
    });
  });

  // Skip the rest of the tests until https://github.com/metabase/metabase/issues/22973 gets resolved
  it.skip("should allow switching from All time filter", () => {
    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    // switch to previous 30 quarters
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    popover().within(() => {
      cy.findByText("All time").click();
    });
    cy.findByTextEnsureVisible("Previous").click();
    cy.findByTextEnsureVisible("days").click();
    cy.findByTextEnsureVisible("quarters").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByTextEnsureVisible("Created At Previous 30 Quarters");
    cy.findByTextEnsureVisible("Previous 30 Quarters");
  });

  it.skip("should stay in-sync with the actual filter", () => {
    cy.findAllByText("Filter").first().click();
    cy.findAllByText("Created At").last().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Last 3 Months").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At Previous 3 Months").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("months").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("years").click();
    cy.button("Add filter").click();
    cy.wait("@dataset");

    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cy.findByTextEnsureVisible("Created At Previous 3 Years");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Previous 3 Years").click();
    popover().within(() => {
      cy.findByText("Previous").should("be.visible");
      cy.findByText("All time").should("not.exist");
      cy.findByText("Next").should("not.exist");
    });

    // switch to All time filter
    popover().within(() => {
      cy.findByText("Previous").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At Previous 3 Years").should("not.exist");
    cy.findByTextEnsureVisible("All time");
  });
});

import { restore, popover, openProductsTable } from "__support__/e2e/cypress";

describe("time-series filter widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable();
  });

  it("should properly display All Time as the initial filtering (metabase#22247)", () => {
    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.findAllByText("Created At")
      .last()
      .click();
    cy.wait("@dataset");
    cy.findByText("Done").click();

    cy.findByText("All Time").click();
    popover().within(() => {
      cy.findByText("Previous").should("not.exist");
      cy.findByText("Next").should("not.exist");

      cy.findByTextEnsureVisible("All Time");
      cy.findByTextEnsureVisible("Apply");
    });
  });

  it("should allow switching from All Time filter", () => {
    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.findAllByText("Created At")
      .last()
      .click();
    cy.wait("@dataset");
    cy.findByText("Done").click();

    // switch to previous 30 quarters
    cy.findByText("All Time").click();
    popover().within(() => {
      cy.findByText("All Time").click();
    });
    cy.findByTextEnsureVisible("Previous").click();
    cy.findByTextEnsureVisible("days").click();
    cy.findByTextEnsureVisible("quarters").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByTextEnsureVisible("Created At Previous 30 Quarters");
    cy.findByTextEnsureVisible("Previous 30 Quarters");
  });

  it("should stay in-sync with the actual filter", () => {
    cy.findAllByText("Filter")
      .first()
      .click();
    cy.findAllByText("Created At")
      .last()
      .click();
    cy.findByText("Last 3 Months").click();
    cy.wait("@dataset");

    cy.findByText("Created At Previous 3 Months").click();
    cy.findByText("months").click();
    cy.findByText("years").click();
    cy.button("Add filter").click();
    cy.wait("@dataset");

    cy.findAllByText("Summarize")
      .first()
      .click();
    cy.findAllByText("Created At")
      .last()
      .click();
    cy.wait("@dataset");
    cy.findByText("Done").click();

    cy.findByTextEnsureVisible("Created At Previous 3 Years");

    cy.findByText("Previous 3 Years").click();
    popover().within(() => {
      cy.findByText("Previous").should("be.visible");
      cy.findByText("All Time").should("not.exist");
      cy.findByText("Next").should("not.exist");
    });

    // switch to All Time filter
    popover().within(() => {
      cy.findByText("Previous").click();
    });
    cy.findByText("All Time").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("Created At Previous 3 Years").should("not.exist");
    cy.findByTextEnsureVisible("All Time");
  });
});

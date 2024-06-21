import {
  echartsContainer,
  openProductsTable,
  rightSidebar,
  restore,
  summarize,
} from "e2e/support/helpers";

describe("issue 44532", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable();
  });

  it("should update chart metrics and dimensions with each added breakout (metabase #44532)", () => {
    summarize();

    rightSidebar()
      .findByRole("listitem", { name: "Category" })
      .button("Add dimension")
      .click();
    cy.wait("@dataset");

    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Category").should("exist"); // x-axis

      // x-axis values
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    rightSidebar()
      .findByRole("listitem", { name: "Created At" })
      .button("Add dimension")
      .click();
    cy.wait("@dataset");

    cy.findByLabelText("Legend").within(() => {
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Created At").should("exist"); // x-axis

      // x-axis values
      cy.findByText("January 2023").should("exist");
      cy.findByText("January 2024").should("exist");
      cy.findByText("January 2025").should("exist");

      // previous x-axis values
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gadget").should("not.exist");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Widget").should("not.exist");
    });

    rightSidebar().button("Done").click();
    cy.wait("@dataset");

    cy.findByLabelText("Legend").within(() => {
      cy.findByText("Doohickey").should("exist");
      cy.findByText("Gadget").should("exist");
      cy.findByText("Gizmo").should("exist");
      cy.findByText("Widget").should("exist");
    });

    echartsContainer().within(() => {
      cy.findByText("Count").should("exist"); // y-axis
      cy.findByText("Created At").should("exist"); // x-axis

      // x-axis values
      cy.findByText("January 2023").should("exist");
      cy.findByText("January 2024").should("exist");
      cy.findByText("January 2025").should("exist");

      // previous x-axis values
      cy.findByText("Doohickey").should("not.exist");
      cy.findByText("Gadget").should("not.exist");
      cy.findByText("Gizmo").should("not.exist");
      cy.findByText("Widget").should("not.exist");
    });
  });
});

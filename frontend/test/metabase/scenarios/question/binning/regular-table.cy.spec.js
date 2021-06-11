import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

describe("scenarios > binning > regular table", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("should work for number", () => {
    it("via column popover", () => {
      openOrdersTable();

      cy.findByText("Total").click();
      cy.findByText("Distribution").click();
      getTitle("Count by Total: Auto binned");
      cy.get(".bar");
    });

    it("via simple question", () => {
      openOrdersTable();

      cy.findByText("Summarize").click();
      cy.findByTestId("sidebar-right").within(() => {
        cy.findByText("Total").click();
      });

      getTitle("Count by Total: Auto binned");
      cy.get(".bar");

      openPopoverFromSelectedBinningOption("Total", "Auto binned");

      popover().within(() => {
        cy.findByText("Auto bin"); // Selected option is not highlghted in simple mode
        cy.findByText("Don't bin");
        cy.findByText("100 bins");
        cy.findByText("50 bins");
        cy.findByText("10 bins").click();
      });

      getTitle("Count by Total: 10 bins");
      cy.get(".bar");

      openPopoverFromSelectedBinningOption("Total", "10 bins");

      popover().within(() => {
        cy.findByText("Don't bin").click();
      });

      getTitle("Count by Total");
      cy.get(".cellData");
    });

    it("via custom question", () => {
      openOrdersTable({ mode: "notebook" });

      cy.findByText("Summarize").click();
      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      cy.findByText("Total").click();

      cy.button("Visualize").click();

      getTitle("Count by Total: Auto binned");
      cy.get(".bar");

      // Change binning option
      cy.icon("notebook").click();
      cy.findByText("Total: Auto binned").click();

      openPopoverFromSelectedBinningOption("Total", "Auto binned");

      cy.findByText("10 bins").click();
      cy.button("Visualize").click();

      getTitle("Count by Total: 10 bins");
      cy.get(".bar");

      // Change binning bucket
      cy.icon("notebook").click();
      cy.findByText("Total: 10 bins").click();

      openPopoverFromSelectedBinningOption("Total", "10 bins");

      popover()
        .last()
        .within(() => {
          cy.findByText("Don't bin").click();
        });
      cy.button("Visualize").click();

      getTitle("Count by Total");
      cy.get(".TableInteractive");
    });
  });
});

function openPopoverFromSelectedBinningOption(table, binning) {
  cy.get(".List-item--selected")
    .should("be.visible")
    .as("targetListItem")
    .should("contain", table);

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", binning)
    .click();
}

function getTitle(title) {
  cy.findByText(title);
}

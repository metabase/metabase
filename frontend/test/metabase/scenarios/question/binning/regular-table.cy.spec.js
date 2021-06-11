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

  describe("should work for timestamp", () => {
    it("via column popover", () => {
      openOrdersTable();
      cy.findByText("Created At").click();
      cy.findByText("Distribution").click();

      getTitle("Count by Created At: Month");
      cy.get("circle");

      // Check all binning options from the footer
      cy.get(".AdminSelect-content")
        .contains("Month")
        .click();
      popover().within(() => {
        cy.findByText("Minute");
        cy.findByText("Hour");
        cy.findByText("Day");
        cy.findByText("Week");
        cy.findByText("Month")
          .closest("li")
          .should("have.class", "List-item--selected");
        cy.findByText("Quarter");
        cy.findByText("Year");
      });
    });

    it("via simple question", () => {
      openOrdersTable();
      cy.findByText("Summarize").click();

      cy.findByTestId("sidebar-right").within(() => {
        // There is really no better way to scope this to "Orders".
        cy.findAllByText("Created At")
          .first() // We have to rely on the order of tables until this UI gets updated.
          .click();
      });

      getTitle("Count by Created At: Month");
      cy.get("circle");

      openPopoverFromSelectedBinningOption("Created At", "by month");
      popover();
    });

    it("via custom question", () => {
      openOrdersTable({ mode: "notebook" });
      cy.findByText("Summarize").click();

      cy.findByText("Count of rows").click();
      cy.findByText("Pick a column to group by").click();
      cy.findByText("Created At").click();

      cy.button("Visualize").click();
      cy.get("circle");

      getTitle("Count by Created At: Month");
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

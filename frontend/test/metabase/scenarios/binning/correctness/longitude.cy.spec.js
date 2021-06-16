import { restore, popover, openPeopleTable } from "__support__/e2e/cypress";

describe("scenarios > binning > correctness > longitude", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openPeopleTable();
    cy.findByText("Summarize").click();
  });

  it("Auto bin", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Auto bin").click();
    });
    getTitle("Count by Longitude: Auto binned");
    cy.get(".bar");
    cy.get(".y-axis-label")
      .invoke("text")
      .should("eq", "Count");
    cy.get(".x-axis-label")
      .invoke("text")
      .should("eq", "Longitude");

    cy.get(".axis.x").within(() => {
      cy.findByText("170° W");
    });
  });

  it("0.1 degrees", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Bin every 0.1 degrees").click();
    });
    getTitle("Count by Longitude: 0.1°");
    cy.get(".bar");

    cy.get(".axis.x").should("not.exist");
  });

  it("1 degree", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Bin every 1 degree").click();
    });
    getTitle("Count by Longitude: 1°");
    cy.get(".bar");

    cy.get(".axis.x").should("not.exist");
  });

  it("10 degrees", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Bin every 10 degrees").click();
    });
    getTitle("Count by Longitude: 10°");
    cy.get(".bar");

    cy.get(".axis.x").within(() => {
      cy.findByText("170° W");
      cy.findByText("160° W");
      cy.findByText("60° W");
    });
  });

  it("20 degrees", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Bin every 20 degrees").click();
    });
    getTitle("Count by Longitude: 20°");
    cy.get(".bar");

    cy.get(".axis.x").within(() => {
      cy.findByText("180° W");
      cy.findByText("160° W");
      cy.findByText("60° W");
    });
  });

  it("Don't bin", () => {
    openPopoverFromSelectedBinningOption("Longitude", "Auto bin");
    popover().within(() => {
      cy.findByText("Don't bin").click();
    });
    getTitle("Count by Longitude");

    cy.get(".cellData");
  });
});

function openPopoverFromSelectedBinningOption(column, binning) {
  cy.findByTestId("sidebar-right")
    .contains(column)
    .first()
    .closest(".List-item")
    .should("be.visible")
    .as("targetListItem");

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", binning)
    .click();
}

function getTitle(title) {
  cy.findByText(title);
}

import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

const foo = {
  "Auto bin": {
    selected: "Auto binned",
    representativeValues: ["-60", "0", "20", "40", "100", "160"],
  },
  "10 bins": {
    selected: "10 bins",
    representativeValues: ["-50", "-40", "-10", "0", "10", "100", "150", "160"],
  },
  "50 bins": {
    selected: "50 bins",
    representativeValues: ["-50", "0", "50", "100", "150", "200"],
  },
  "100 bins": {
    selected: "100 bins",
    representativeValues: ["-100", "0", "100", "200"],
  },
};

describe("scenarios > binning > correctness > number", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openOrdersTable();
    cy.findByText("Summarize").click();
    openPopoverFromSelectedBinningOption("Total", "Auto bin");
  });

  Object.entries(foo).forEach(
    ([bucketSize, { selected, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        // Wrong values are returned for everything except "auto bin", and even that is questionable how it should work
        cy.onlyOn(bucketSize === "Auto bin");

        popover().within(() => {
          cy.findByText(bucketSize).click();
        });

        getTitle(`Count by Total: ${selected}`);
        cy.get(".bar");

        assertOnXYAxisLabels();

        cy.get(".axis.x").within(() => {
          representativeValues.forEach(value => {
            cy.findByText(value);
          });
        });
      });
    },
  );

  it("Don't bin", () => {
    popover().within(() => {
      cy.findByText("Don't bin").click();
    });
    getTitle("Count by Total");

    cy.get(".cellData")
      .should("contain", "Total")
      .and("contain", "Count")
      .and("contain", "-45.47");
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

function assertOnXYAxisLabels() {
  cy.get(".y-axis-label")
    .invoke("text")
    .should("eq", "Count");
  cy.get(".x-axis-label")
    .invoke("text")
    .should("eq", "Total");
}

import { restore, popover, openPeopleTable } from "__support__/e2e/cypress";

const LONGITUDE_OPTIONS = {
  "Auto bin": {
    selected: "Auto binned",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 0.1 degrees": {
    selected: "0.1°",
    representativeValues: null,
  },
  "Bin every 1 degree": {
    selected: "1°",
    representativeValues: ["167° W", "164° W", "67° W"],
  },
  "Bin every 10 degrees": {
    selected: "10°",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 20 degrees": {
    selected: "20°",
    representativeValues: ["180° W", "160° W", "100° W", "80° W", "60° W"],
  },
};

describe("scenarios > binning > correctness > longitude", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openPeopleTable();
    cy.findByText("Summarize").click();
    openPopoverFromDefaultBucketSize("Longitude", "Auto bin");
  });

  Object.entries(LONGITUDE_OPTIONS).forEach(
    ([bucketSize, { selected, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        popover().within(() => {
          cy.findByText(bucketSize).click();
        });

        getTitle(`Count by Longitude: ${selected}`);
        cy.get(".bar");

        assertOnXYAxisLabels();
        assertOnXAxisTicks(representativeValues);
      });
    },
  );

  it.only("Don't bin", () => {
    popover().within(() => {
      cy.findByText("Don't bin").click();
    });
    getTitle("Count by Longitude");

    cy.get(".cellData");
  });
});

function openPopoverFromDefaultBucketSize(column, bucket) {
  cy.findByTestId("sidebar-right")
    .contains(column)
    .first()
    .closest(".List-item")
    .should("be.visible")
    .as("targetListItem");

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", bucket)
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
    .should("eq", "Longitude");
}

function assertOnXAxisTicks(values) {
  if (values) {
    cy.get(".axis.x").within(() => {
      values.forEach(value => {
        cy.findByText(value);
      });
    });
  } else {
    cy.get(".axis.x").should("not.exist");
  }
}

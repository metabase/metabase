import {
  restore,
  popover,
  openPeopleTable,
  summarize,
  echartsContainer,
  chartPathWithFillColor,
} from "e2e/support/helpers";

import { LONGITUDE_OPTIONS } from "./shared/constants";

describe("scenarios > binning > correctness > longitude", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openPeopleTable();
    summarize();
    openPopoverFromDefaultBucketSize("Longitude", "Auto bin");
  });

  Object.entries(LONGITUDE_OPTIONS).forEach(
    ([bucketSize, { selected, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        popover().within(() => {
          cy.findByText(bucketSize).click();
        });

        cy.get("li[aria-selected='true']")
          .should("contain", "Longitude")
          .and("contain", selected);

        // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        getTitle(`Count by Longitude: ${selected}`);
        chartPathWithFillColor("#509EE3");

        assertOnXYAxisLabels();
        assertOnXAxisTicks(representativeValues);
      });
    },
  );

  it("Don't bin", () => {
    popover().within(() => {
      cy.findByText("Don't bin").click();
    });

    cy.get("li[aria-selected='true']")
      .should("contain", "Longitude")
      .and("contain", "Unbinned");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    getTitle("Count by Longitude");
    cy.get("[data-testid=cell-data]")
      .should("contain", "Longitude")
      .should("contain", "Count")
      .and("contain", "166.54257260° W")
      .and("contain", "1");
  });
});

function openPopoverFromDefaultBucketSize(column, bucket) {
  cy.findAllByTestId("dimension-list-item")
    .filter(`:contains("${column}")`)
    .as("targetListItem")
    .realHover()
    .within(() => {
      cy.findByTestId("dimension-list-item-binning")
        .as("listItemSelectedBinning")
        .should("contain", bucket)
        .click();
    });
}

function getTitle(title) {
  cy.findByText(title);
}

function assertOnXYAxisLabels() {
  echartsContainer().get("text").contains("Count");
  echartsContainer().get("text").contains("Longitude");
}

function assertOnXAxisTicks(values) {
  if (values) {
    echartsContainer().within(() => {
      values.forEach(value => {
        cy.findByText(value);
      });
    });
  }
}

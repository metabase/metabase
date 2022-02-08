import {
  restore,
  popover,
  getBinningButtonForDimension,
} from "__support__/e2e/cypress";

import { TIME_OPTIONS } from "./constants";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Test Question",
  query: {
    "source-table": ORDERS_ID,
    limit: 50,
  },
};

describe("scenarios > binning > correctness > time series", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("qb-header-action-panel")
      .contains("Summarize")
      .click();

    openPopoverFromDefaultBucketSize("Created At", "by month");
  });

  Object.entries(TIME_OPTIONS).forEach(
    ([bucketSize, { selected, representativeValues }]) => {
      // We are forced to ignore the case here because we construct titles like so:
      // "Day of Month" (bucket) -> "Day of month" (title)
      // This feels weird and is probably worth investigating further.
      const titleRegex = new RegExp(`Count by Created At: ${bucketSize}`, "i");
      const bucketRegex = new RegExp(bucketSize, "i");

      it(`should return correct values for ${bucketSize}`, () => {
        popover().within(() => {
          cy.findByText(bucketSize).click();
          cy.wait("@dataset");
        });

        getBinningButtonForDimension({
          name: "Created At",
          isSelected: true,
        }).should("have.text", selected);

        cy.findByText("Done").click();
        cy.findByTestId("sidebar-right").should("not.be.visible");

        getTitle(titleRegex);

        assertOnHeaderCells(bucketSize);
        assertOnTableValues(representativeValues);

        assertOnTimeSeriesFooter(bucketRegex);
      });
    },
  );
});

function openPopoverFromDefaultBucketSize(name, bucket) {
  getBinningButtonForDimension({ name })
    .should("have.text", bucket)
    .click({ force: true });
}

function getTitle(title) {
  cy.findByText(title);
}

function assertOnHeaderCells(bucketSize) {
  const headerRegex = new RegExp(`Created At: ${bucketSize}`, "i");

  cy.get(".cellData")
    .eq(0)
    .contains(headerRegex);

  cy.get(".cellData")
    .eq(1)
    .contains("Count");
}

function assertOnTableValues(values) {
  values.map(v => {
    cy.findByText(v);
  });
}

function assertOnTimeSeriesFooter(regex) {
  cy.findAllByTestId("select-button-content")
    .first()
    .invoke("text")
    .should("eq", "All Time");
  cy.findAllByTestId("select-button-content")
    .last()
    .invoke("text")
    .should("match", regex);
}

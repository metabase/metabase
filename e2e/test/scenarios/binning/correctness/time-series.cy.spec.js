import {
  restore,
  popover,
  getBinningButtonForDimension,
  summarize,
  rightSidebar,
} from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { TIME_OPTIONS } from "./shared/constants";

const { ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Test Question",
  query: {
    "source-table": ORDERS_ID,
    limit: 50,
  },
};

/**
 * The list of issues this spec covers:
 *  - metabase#11183
 *  -
 */
describe("scenarios > binning > correctness > time series", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(questionDetails, { visitQuestion: true });

    summarize();

    openPopoverFromDefaultBucketSize("Created At", "by month");
  });

  Object.entries(TIME_OPTIONS).forEach(
    ([bucketSize, { selected, isHiddenByDefault, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        popover().within(() => {
          if (isHiddenByDefault) {
            cy.button("More…").click();
          }
          cy.findByText(bucketSize).click();
          cy.wait("@dataset");
        });

        getBinningButtonForDimension({
          name: "Created At",
          isSelected: true,
        }).should("have.text", selected);

        rightSidebar().button("Done").click();

        getTitle(`Count by Created At: ${bucketSize}`);

        assertOnHeaderCells(bucketSize);
        assertOnTableValues(representativeValues);

        assertOnTimeSeriesFooter(bucketSize);
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
  cy.get(".cellData").eq(0).contains(`Created At: ${bucketSize}`);
  cy.get(".cellData").eq(1).contains("Count");
}

function assertOnTableValues(values) {
  values.map(v => {
    cy.findByText(v);
  });
}

function assertOnTimeSeriesFooter(str) {
  cy.findByTestId("timeseries-filter-button")
    .invoke("text")
    .should("eq", "All time");
  cy.findByTestId("timeseries-bucket-button")
    .invoke("text")
    .should("contain", str);
}

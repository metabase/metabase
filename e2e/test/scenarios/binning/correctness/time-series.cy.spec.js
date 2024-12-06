import { H } from "e2e/support";
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
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(questionDetails, { visitQuestion: true });

    H.summarize();

    openPopoverFromDefaultBucketSize("Created At", "by month");
  });

  Object.entries(TIME_OPTIONS).forEach(
    ([bucketSize, { selected, isHiddenByDefault, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        H.popover().within(() => {
          if (isHiddenByDefault) {
            cy.button("More…").click();
          }
          cy.findByText(bucketSize).click();
          cy.wait("@dataset");
        });

        H.getBinningButtonForDimension({
          name: "Created At",
          isSelected: true,
        }).should("have.text", selected);

        H.rightSidebar().button("Done").click();

        getTitle(`Count by Created At: ${bucketSize}`);

        assertOnHeaderCells(bucketSize);
        assertOnTableValues(representativeValues);

        assertOnTimeSeriesFooter(bucketSize);
      });
    },
  );
});

function openPopoverFromDefaultBucketSize(name, bucket) {
  H.getBinningButtonForDimension({ name })
    .should("have.text", bucket)
    .click({ force: true });
}

function getTitle(title) {
  cy.findByText(title);
}

function assertOnHeaderCells(bucketSize) {
  cy.get("[data-testid=cell-data]").eq(0).contains(`Created At: ${bucketSize}`);
  cy.get("[data-testid=cell-data]").eq(1).contains("Count");
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

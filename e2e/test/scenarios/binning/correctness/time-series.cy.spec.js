const { H } = cy;
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

describe("scenarios > binning > correctness > time series", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should return correct values for every bucket size", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.summarize();

    cy.log("the first bucket is picked from the unselected column");
    H.getBinningButtonForDimension({ name: "Created At" })
      .should("have.text", "by month")
      .click({ force: true });

    Object.entries(TIME_OPTIONS).forEach(
      (
        [bucketSize, { selected, isHiddenByDefault, firstRows }],
        index,
        entries,
      ) => {
        cy.log(bucketSize);

        if (index > 0) {
          H.summarize();
          H.getBinningButtonForDimension({
            name: "Created At",
            isSelected: true,
          }).click({ force: true });
        }

        // The popover opens expanded when the current bucket is a hidden one.
        const isExpanded =
          index > 0 && Boolean(entries[index - 1][1].isHiddenByDefault);

        cy.intercept("POST", "/api/dataset").as(`dataset-${index}`);
        H.popover().within(() => {
          if (isHiddenByDefault && !isExpanded) {
            cy.button("More…").click();
          }
          cy.findByText(bucketSize).click();
        });
        cy.wait(`@dataset-${index}`);

        H.getBinningButtonForDimension({
          name: "Created At",
          isSelected: true,
        }).should("have.text", selected);

        H.rightSidebar().button("Done").click();

        getTitle(`Count by Created At: ${bucketSize}`);

        H.assertTableData({
          columns: [`Created At: ${bucketSize}`, "Count"],
          firstRows,
        });

        assertOnTimeSeriesFooter(bucketSize);
      },
    );
  });
});

function getTitle(title) {
  cy.findByText(title);
}

function assertOnTimeSeriesFooter(str) {
  cy.findByTestId("timeseries-filter-button")
    .invoke("text")
    .should("eq", "All time");
  cy.findByTestId("timeseries-bucket-button")
    .invoke("text")
    .should("contain", str);
}

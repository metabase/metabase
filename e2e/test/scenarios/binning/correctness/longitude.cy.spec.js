import { openPopoverFromDefaultBucketSize } from "e2e/support/helpers";

const { H } = cy;

import { LONGITUDE_OPTIONS } from "./shared/constants";

describe("scenarios > binning > correctness > longitude", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should return correct values for every bucket size", () => {
    // Increase viewport to allow checking x-axis ticks values on dense data
    cy.viewport(1440, 800);
    H.openPeopleTable();
    H.summarize();

    cy.log("the first bucket is picked from the unselected column");
    openPopoverFromDefaultBucketSize("Longitude", "Auto bin");

    Object.entries(LONGITUDE_OPTIONS).forEach(
      (
        [bucketSize, { selected, representativeValues, isHiddenByDefault }],
        index,
        entries,
      ) => {
        cy.log(bucketSize);

        if (index > 0) {
          openSelectedBinningPopover();
        }

        // The popover opens expanded when the current bucket is a hidden one.
        const isExpanded =
          index > 0 && Boolean(entries[index - 1][1].isHiddenByDefault);

        pickBucket({
          bucketSize,
          shouldExpand: Boolean(isHiddenByDefault) && !isExpanded,
          alias: `dataset-${index}`,
        });

        cy.get("li[aria-selected='true']")
          .should("contain", "Longitude")
          .and("contain", selected);

        cy.findByText("Done").click();

        getTitle(`Count by Longitude: ${selected}`);
        H.chartPathWithFillColor("#509EE3");

        assertOnXYAxisLabels();
        assertOnXAxisTicks(representativeValues);
      },
    );

    cy.log("Don't bin");
    openSelectedBinningPopover();
    // The previous bucket is a hidden one, so the popover is already expanded.
    pickBucket({
      bucketSize: "Don't bin",
      shouldExpand: false,
      alias: "dataset-unbinned",
    });

    cy.get("li[aria-selected='true']")
      .should("contain", "Longitude")
      .and("contain", "Unbinned");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    getTitle("Count by Longitude");
    H.assertTableData({
      columns: ["Longitude", "Count"],
      firstRows: [
        ["166.54257260° W", "1"],
        ["166.09897770° W", "1"],
      ],
    });
  });
});

function openSelectedBinningPopover() {
  H.summarize();
  H.getBinningButtonForDimension({
    name: "Longitude",
    isSelected: true,
  }).click({ force: true });
}

function pickBucket({ bucketSize, shouldExpand, alias }) {
  cy.intercept("POST", "/api/dataset").as(alias);
  H.popover().within(() => {
    if (shouldExpand) {
      cy.findByText("More…").click();
    }
    cy.findByText(bucketSize).click();
  });
  cy.wait(`@${alias}`);
}

function getTitle(title) {
  cy.findByText(title);
}

function assertOnXYAxisLabels() {
  H.echartsContainer().find("text").should("contain", "Count");
  H.echartsContainer().find("text").should("contain", "Longitude");
}

function assertOnXAxisTicks(values) {
  if (values) {
    H.echartsContainer().within(() => {
      values.forEach((value) => {
        cy.findByText(value);
      });
    });
  }
}

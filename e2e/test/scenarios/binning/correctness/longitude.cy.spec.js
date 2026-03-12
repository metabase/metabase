import { openPopoverFromDefaultBucketSize } from "e2e/support/helpers";

const { H } = cy;

import { LONGITUDE_OPTIONS } from "./shared/constants";

describe("scenarios > binning > correctness > longitude", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openPeopleTable();
    H.summarize();
    openPopoverFromDefaultBucketSize("Longitude", "Auto bin");
  });

  Object.entries(LONGITUDE_OPTIONS).forEach(
    ([bucketSize, { selected, representativeValues }]) => {
      it(`should return correct values for ${bucketSize}`, () => {
        // Increase viewport to allow checking x-axis ticks values on dense data
        cy.viewport(1440, 800);
        H.popover().within(() => {
          cy.findByText("More…").click();
          cy.findByText(bucketSize).click();
        });

        cy.get("li[aria-selected='true']")
          .should("contain", "Longitude")
          .and("contain", selected);

        // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
        cy.findByText("Done").click();

        getTitle(`Count by Longitude: ${selected}`);
        H.chartPathWithFillColor("#509EE3");

        assertOnXYAxisLabels();
        assertOnXAxisTicks(representativeValues);
      });
    },
  );

  it("Don't bin", () => {
    H.popover().within(() => {
      cy.findByText("More…").click();
      cy.findByText("Don't bin").click();
    });

    cy.get("li[aria-selected='true']")
      .should("contain", "Longitude")
      .and("contain", "Unbinned");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    getTitle("Count by Longitude");
    cy.get("[data-testid=cell-data]")
      .should("contain", "Longitude")
      .should("contain", "Count")
      .and("contain", "166.54257260° W")
      .and("contain", "1");
  });
});

function getTitle(title) {
  cy.findByText(title);
}

function assertOnXYAxisLabels() {
  H.echartsContainer().get("text").contains("Count");
  H.echartsContainer().get("text").contains("Longitude");
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

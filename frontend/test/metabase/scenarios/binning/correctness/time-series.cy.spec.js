import { restore, popover, openOrdersTable } from "__support__/e2e/cypress";

const TIME_OPTIONS = {
  Minute: {
    selected: "by minute",
    representativeValues: [
      "January 1, 2017, 12:00 AM",
      "January 1, 2018, 12:00 AM",
    ],
    type: "basic",
  },
  Hour: {
    selected: "by hour",
    representativeValues: [
      "January 1, 2017, 12:00 AM",
      "January 1, 2018, 12:00 AM",
      "January 1, 2019, 12:00 AM",
    ],
    type: "basic",
  },
  Day: {
    selected: "by day",
    representativeValues: [
      "January 1, 2017",
      "January 1, 2018",
      "January 1, 2019",
      "January 1, 2020",
    ],
    type: "basic",
  },
  Week: {
    selected: "by week",
    representativeValues: [
      "January, 2017",
      "January, 2018",
      "January, 2019",
      "January, 2020",
    ],
    type: "basic",
  },
  Month: {
    selected: "by month",
    representativeValues: [
      "January, 2017",
      "January, 2018",
      "January, 2019",
      "January, 2020",
    ],
    type: "basic",
  },
  Quarter: {
    selected: "by quarter",
    representativeValues: ["Q1 - 2017", "Q1 - 2018", "Q1 - 2019", "Q1 - 2020"],
    type: "basic",
  },
  Year: {
    selected: "by year",
    representativeValues: ["2016", "2017", "2018", "2019", "2020"],
    type: "basic",
  },
  "Minute of Hour": {
    selected: "by minute of hour",
    representativeValues: ["0", "5", "25", "55"],
    type: "extended",
  },
  "Hour of Day": {
    selected: "by hour of day",
    representativeValues: ["12:00 AM", "2:00 AM", "12:00 PM", "8:00 PM"],
    type: "extended",
  },
  "Day of Week": {
    selected: "by day of week",
    representativeValues: ["Saturday", "Tuesday", "Friday", "Sunday"],
    type: "extended",
  },
  "Day of Month": {
    selected: "by day of month",
    representativeValues: ["5", "10", "15", "30"],
    type: "extended",
  },
  "Day of Year": {
    selected: "by day of year",
    representativeValues: ["50", "100", "150", "300"],
    type: "extended",
  },
  "Week of Year": {
    selected: "by week of year",
    representativeValues: ["5th", "10th", "50th"],
    type: "extended",
  },
  "Month of Year": {
    selected: "by month of year",
    representativeValues: ["January", "June", "December"],
    type: "extended",
  },
  "Quarter of Year": {
    selected: "by quarter of year",
    representativeValues: ["Q1", "Q2", "Q3", "Q4"],
    type: "extended",
  },
};

describe("scenarios > binning > correctness > time series", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openOrdersTable();
    cy.findByText("Summarize").click();
    openPopoverFromDefaultBucketSize("Created At", "by month");
  });

  Object.entries(TIME_OPTIONS).forEach(
    ([bucketSize, { selected, representativeValues, type }]) => {
      // We are forced to ignore the case here because we construct titles like so:
      // "Day of Month" (bucket) -> "Day of month" (title)
      // This feels weird and is probably worth investigating it further.
      const titleRegex = new RegExp(`Count by Created At: ${bucketSize}`, "i");
      const bucketRegex = new RegExp(bucketSize, "i");

      it(`should return correct values for ${bucketSize}`, () => {
        popover().within(() => {
          cy.findByText(bucketSize).click();
        });

        cy.get(".List-item--selected")
          .should("contain", "Created At")
          .and("contain", selected);

        cy.findByText("Done").click();
        cy.findByTestId("sidebar-right").should("not.be.visible");

        getTitle(titleRegex);
        getVisualization(type);

        assertOnXYAxisLabels();
        assertOnXAxisTicks(representativeValues);

        assertOnTimeSeriesFooter(bucketRegex);
      });
    },
  );
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

function getVisualization(binningType) {
  const selector = binningType === "basic" ? "circle" : ".bar";

  cy.get(selector);
}

function assertOnXYAxisLabels() {
  cy.get(".y-axis-label")
    .invoke("text")
    .should("eq", "Count");
  cy.get(".x-axis-label")
    .invoke("text")
    .should("eq", "Created At");
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

function assertOnTimeSeriesFooter(regex) {
  cy.get(".AdminSelect-content")
    .first()
    .invoke("text")
    .should("eq", "All Time");
  cy.get(".AdminSelect-content")
    .last()
    .invoke("text")
    .should("match", regex);
}

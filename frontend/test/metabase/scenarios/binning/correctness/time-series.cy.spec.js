import {
  restore,
  popover,
  getBinningButtonForDimension,
} from "__support__/e2e/cypress";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID } = SAMPLE_DATABASE;

const TIME_OPTIONS = {
  Minute: {
    selected: "by minute",
    representativeValues: ["April 30, 2016, 6:56 PM", "May 10, 2016, 9:38 AM"],
  },
  Hour: {
    selected: "by hour",
    representativeValues: ["April 30, 2016, 6:00 PM", "May 10, 2016, 9:00 AM"],
  },
  Day: {
    selected: "by day",
    representativeValues: ["April 30, 2016", "May 10, 2016"],
  },
  Week: {
    selected: "by week",
    representativeValues: [
      "April 24, 2016 – April 30, 2016",
      "May 8, 2016 – May 14, 2016",
    ],
  },
  Month: {
    selected: "by month",
    representativeValues: ["April, 2016", "May, 2016"],
  },
  Quarter: {
    selected: "by quarter",
    representativeValues: ["Q2 - 2016", "Q1 - 2017", "Q1 - 2018", "Q1 - 2019"],
  },
  Year: {
    selected: "by year",
    representativeValues: ["2016", "2017", "2018", "2019", "2020"],
  },
  "Minute of Hour": {
    selected: "by minute of hour",
    representativeValues: ["0", "5", "8", "13"],
    type: "extended",
  },
  "Hour of Day": {
    selected: "by hour of day",
    representativeValues: ["12:00 AM", "2:00 AM", "12:00 PM", "8:00 PM"],
  },
  "Day of Week": {
    selected: "by day of week",
    representativeValues: ["Saturday", "Tuesday", "Friday", "Sunday"],
  },
  "Day of Month": {
    selected: "by day of month",
    representativeValues: ["5", "10", "15", "30"],
  },
  "Day of Year": {
    selected: "by day of year",
    representativeValues: ["1", "10", "12"],
  },
  "Week of Year": {
    selected: "by week of year",
    representativeValues: ["1st", "2nd", "3rd", "10th"],
  },
  "Month of Year": {
    selected: "by month of year",
    representativeValues: ["January", "June", "December"],
  },
  "Quarter of Year": {
    selected: "by quarter of year",
    representativeValues: ["Q1", "Q2", "Q3", "Q4"],
  },
};

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

    cy.findByText("Summarize").click();
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

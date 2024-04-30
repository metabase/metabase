import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  openTable,
  visualize,
  changeBinningForDimension,
  summarize,
  chartPathWithFillColor,
  cartesianChartCircle,
} from "e2e/support/helpers";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

describe("scenarios > binning > binning options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("via simple question", () => {
    it("should work for number", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Total",
        defaultBucket: "Auto bin",
        bucketSize: "50 bins",
      });

      getTitle("Count by Total: 50 bins");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("70");
    });

    it("should work for time series", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Created At",
        defaultBucket: "by month",
        bucketSize: "Quarter",
      });

      getTitle("Count by Created At: Quarter");

      cartesianChartCircle();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q1 2023");
    });

    it("should work for longitude/latitude", () => {
      chooseInitialBinningOption({
        table: PEOPLE_ID,
        column: "Longitude",
        defaultBucket: "Auto bin",
        bucketSize: "Bin every 20 degrees",
      });

      getTitle("Count by Longitude: 20°");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("180° W");
    });
  });

  context("via custom question", () => {
    it("should work for number", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Total",
        defaultBucket: "Auto bin",
        bucketSize: "50 bins",
        mode: "notebook",
      });

      getTitle("Count by Total: 50 bins");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("70");
    });

    it("should work for time series", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Created At",
        defaultBucket: "by month",
        bucketSize: "Quarter",
        mode: "notebook",
      });

      getTitle("Count by Created At: Quarter");

      cartesianChartCircle();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q1 2023");
    });

    it("should work for longitude/latitude", () => {
      chooseInitialBinningOption({
        table: PEOPLE_ID,
        column: "Longitude",
        defaultBucket: "Auto bin",
        bucketSize: "Bin every 20 degrees",
        mode: "notebook",
      });

      getTitle("Count by Longitude: 20°");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("180° W");
    });
  });

  context("via column popover", () => {
    it("should work for number", () => {
      openTable({ table: ORDERS_ID });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      getTitle("Count by Total: Auto binned");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("60");
    });

    it("should work for time series", () => {
      openTable({ table: ORDERS_ID });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      getTitle("Count by Created At: Month");

      cartesianChartCircle();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("January 2023");
    });

    it("should work for longitude/latitude", () => {
      openTable({ table: PEOPLE_ID });
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Longitude").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      getTitle("Count by Longitude: Auto binned");

      chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("170° W");
    });
  });
});

function chooseInitialBinningOption({
  table,
  column,
  defaultBucket,
  bucketSize,
  mode = null,
} = {}) {
  openTable({ table, mode });
  summarize({ mode });

  if (mode === "notebook") {
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();

    changeBinningForDimension({
      name: column,
      fromBinning: defaultBucket,
      toBinning: bucketSize,
    });

    visualize();
  } else {
    changeBinningForDimension({
      name: column,
      fromBinning: defaultBucket,
      toBinning: bucketSize,
    });
  }
}

function getTitle(title) {
  cy.findByText(title);
}

const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, PEOPLE_ID } = SAMPLE_DATABASE;

const NUMBER_BUCKETS = [
  "Auto bin",
  "10 bins",
  "50 bins",
  "100 bins",
  "Don't bin",
];

const TIME_BUCKETS = [
  "Minute",
  "Hour",
  "Day",
  "Week",
  "Month",
  "Quarter",
  "Year",
  "Minute of hour",
  "Hour of day",
  "Day of week",
  "Day of month",
  "Day of year",
  "Week of year",
  "Month of year",
  "Quarter of year",
  "Don't bin",
];

const LONGITUDE_BUCKETS = [
  "Auto bin",
  "Bin every 0.1 degrees",
  "Bin every 1 degree",
  "Bin every 10 degrees",
  "Bin every 20 degrees",
  "Bin every 0.05 degrees",
  "Bin every 0.01 degrees",
  "Bin every 0.005 degrees",
  "Don't bin",
];

/**
 * Makes sure that all binning options (bucket sizes) are rendered correctly for the regular table.
 *  1. no option should be rendered multiple times
 *  2. the selected option should be highlighted when the popover with all options opens
 *  3. choosing another option re-runs the query with the new bucket size
 *
 * This spec covers the following issues:
 *  - metabase#15574
 */

describe("scenarios > binning > binning options", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  context("via simple question", () => {
    it("should render and apply number binning options", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Total" });
      getTitle("Count by Total: Auto binned");

      openBinningListForDimension("Total", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
      cy.intercept("POST", "/api/dataset").as("rerun");
      selectOption("50 bins");
      cy.wait("@rerun");

      getTitle("Count by Total: 50 bins");
      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("70");
    });

    it("should render and apply time series binning options", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Created At" });
      getTitle("Count by Created At: Month");

      openBinningListForDimension("Created At", "by month");
      getAllOptions({
        options: TIME_BUCKETS,
        isSelected: "Month",
        shouldExpandList: true,
      });
      cy.intercept("POST", "/api/dataset").as("rerun");
      selectOption("Quarter");
      cy.wait("@rerun");

      getTitle("Count by Created At: Quarter");
      H.cartesianChartCircle();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q1 2026");
    });

    it("should render and apply longitude/latitude binning options", () => {
      chooseInitialBinningOption({ table: PEOPLE_ID, column: "Longitude" });
      getTitle("Count by Longitude: Auto binned");

      openBinningListForDimension("Longitude", "Auto binned");
      getAllOptions({
        options: LONGITUDE_BUCKETS,
        isSelected: "Auto bin",
        shouldExpandList: true,
      });
      cy.intercept("POST", "/api/dataset").as("rerun");
      selectOption("Bin every 20 degrees");
      cy.wait("@rerun");

      getTitle("Count by Longitude: 20°");
      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("180° W");
    });

    it("should apply a number bucket picked from an unselected column", () => {
      H.openTable({ table: ORDERS_ID });
      H.summarize();
      H.changeBinningForDimension({
        name: "Total",
        fromBinning: "Auto bin",
        toBinning: "50 bins",
      });

      getTitle("Count by Total: 50 bins");
      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("70");
    });
  });

  context("via custom question", () => {
    it("should render and apply number binning options", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        mode: "notebook",
        column: "Total",
      });

      getTitle("Count by Total: Auto binned");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total: Auto binned").click();
      openBinningListForDimension("Total", "Auto binned");

      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
      selectOption("50 bins");

      H.getNotebookStep("summarize").findByText("Total: 50 bins");
      H.visualize();

      getTitle("Count by Total: 50 bins");
      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("70");
    });

    it("should render and apply time series binning options", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        mode: "notebook",
        column: "Created At",
      });

      getTitle("Count by Created At: Month");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At: Month").click();
      openBinningListForDimension("Created At", "by month");

      getAllOptions({
        options: TIME_BUCKETS,
        isSelected: "Month",
        shouldExpandList: true,
      });
      selectOption("Quarter");

      H.getNotebookStep("summarize").findByText("Created At: Quarter");
      H.visualize();

      getTitle("Count by Created At: Quarter");
      H.cartesianChartCircle();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Q1 2026");
    });

    it("should render and apply longitude/latitude binning options", () => {
      chooseInitialBinningOption({
        table: PEOPLE_ID,
        mode: "notebook",
        column: "Longitude",
      });

      getTitle("Count by Longitude: Auto binned");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Longitude: Auto binned").click();
      openBinningListForDimension("Longitude", "Auto binned");

      getAllOptions({
        options: LONGITUDE_BUCKETS,
        isSelected: "Auto bin",
        shouldExpandList: true,
      });
      selectOption("Bin every 20 degrees");

      H.getNotebookStep("summarize").findByText("Longitude: 20°");
      H.visualize();

      getTitle("Count by Longitude: 20°");
      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("180° W");
    });
  });

  context("via column popover", () => {
    it("should work for number", () => {
      H.openTable({ table: ORDERS_ID });
      H.tableHeaderClick("Total");
      H.popover().findByText("Distribution").click();

      getTitle("Count by Total: Auto binned");

      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("60");
    });

    it("should work for time series", () => {
      H.openTable({ table: ORDERS_ID });
      H.tableHeaderClick("Created At");
      H.popover().findByText("Distribution").click();

      getTitle("Count by Created At: Month");

      H.cartesianChartCircle();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("January 2026");

      cy.log(
        "time series footer highlights the current bucket (metabase#11183)",
      );
      cy.findByTestId("timeseries-bucket-button").click();
      H.popover()
        .findByText("Month")
        .parent()
        .should("have.attr", "aria-selected", "true");
    });

    it("should work for longitude/latitude", () => {
      H.openTable({ table: PEOPLE_ID });
      H.tableHeaderClick("Longitude");
      H.popover().findByText("Distribution").click();

      getTitle("Count by Longitude: Auto binned");

      H.chartPathWithFillColor("#509EE3");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("170° W");
    });
  });
});

function chooseInitialBinningOption({ table, column, mode = null } = {}) {
  H.openTable({ table, mode });
  H.summarize({ mode });

  if (mode === "notebook") {
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText(column).click();
  } else {
    cy.findByTestId("sidebar-right").contains(column).first().click();
  }
}

function openBinningListForDimension(column, binning) {
  H.getBinningButtonForDimension({ name: column, isSelected: true })
    .should("contain", binning)
    .click();
}

function getTitle(title) {
  cy.findByText(title);
}

function getAllOptions({ options, isSelected, shouldExpandList } = {}) {
  const selectedOption = options.find((option) => option === isSelected);
  const regularOptions = options.filter((option) => option !== isSelected);

  // Custom question has two popovers open.
  // The binning options are in the latest (last) one.
  // Using `.last()` works even when only one popover is open so it covers both scenarios.
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover()
    .last()
    .within(() => {
      if (shouldExpandList) {
        cy.findByText("More…").click();
      }

      regularOptions.forEach((option) => {
        // Implicit assertion - will fail if string is rendered multiple times
        cy.findByText(option);
      });

      if (isSelected) {
        cy.findByText(selectedOption)
          .closest("li")
          .should("have.attr", "aria-selected", "true");
      }
    });
}

function selectOption(option) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  H.popover().last().findByText(option).click();
}

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
 *
 * This spec covers the following issues:
 *  - metabase#15574
 */

describe("scenarios > binning > binning options", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    H.restore();
    cy.signInAsAdmin();
  });

  context("via simple question", () => {
    it("should render number binning options correctly", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Total" });
      getTitle("Count by Total: Auto binned");

      openBinningListForDimension("Total", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should render time series binning options correctly", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Created At" });
      getTitle("Count by Created At: Month");

      openBinningListForDimension("Created At", "by month");
      getAllOptions({
        options: TIME_BUCKETS,
        isSelected: "Month",
        shouldExpandList: true,
      });
    });

    it("should render longitude/latitude binning options correctly", () => {
      chooseInitialBinningOption({ table: PEOPLE_ID, column: "Longitude" });
      getTitle("Count by Longitude: Auto binned");

      openBinningListForDimension("Longitude", "Auto binned");
      getAllOptions({
        options: LONGITUDE_BUCKETS,
        isSelected: "Auto bin",
        shouldExpandList: true,
      });
    });
  });

  context("via custom question", () => {
    it("should render number binning options correctly", () => {
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
    });

    it("should render time series binning options correctly", () => {
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
    });

    it("should render longitude/latitude binning options correctly", () => {
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
    });
  });

  context("via time series footer (metabase#11183)", () => {
    it("should render time series binning options correctly", () => {
      H.openTable({ table: ORDERS_ID });
      H.tableHeaderClick("Created At");
      H.popover().findByText("Distribution").click();
      getTitle("Count by Created At: Month");
      cy.findByTestId("timeseries-bucket-button").click();
      H.popover().within(() => {
        cy.findByText("Month")
          .parent()
          .should("have.attr", "aria-selected", "true");
      });
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

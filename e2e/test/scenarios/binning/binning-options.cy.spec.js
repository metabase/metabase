import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  openTable,
  visitQuestionAdhoc,
  getBinningButtonForDimension,
  summarize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PEOPLE_ID, PEOPLE, PRODUCTS_ID, PRODUCTS } =
  SAMPLE_DATABASE;

const ordersJoinPeopleQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People" }],
        ],
        alias: "People",
      },
    ],
    fields: [["field", ORDERS.ID, null]],
  },
  database: SAMPLE_DB_ID,
};

const ordersJoinProductsQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    joins: [
      {
        fields: "all",
        "source-table": PRODUCTS_ID,
        condition: [
          "=",
          ["field", ORDERS.PRODUCT_ID, null],
          ["field", PRODUCTS.ID, { "join-alias": "Products" }],
        ],
        alias: "Products",
      },
    ],
    fields: [["field", ORDERS.ID, null]],
  },
  database: SAMPLE_DB_ID,
};

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
    restore();
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
      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Longitude: Auto binned").click();
      openBinningListForDimension("Longitude", "Auto binned");

      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
    });
  });

  context("via time series footer (metabase#11183)", () => {
    // TODO: enable again when metabase#35546 is completed
    it.skip("should render time series binning options correctly", () => {
      openTable({ table: ORDERS_ID });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Created At").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Distribution").click();

      getTitle("Count by Created At: Month");

      // Check all binning options from the footer
      cy.findAllByTestId("select-button-content").contains("Month").click();
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });
  });

  context.skip("implicit joins (metabase#16674)", () => {
    it("should work for time series", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Birth Date",
      });

      openBinningListForDimension("Birth Date", "by month");
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should work for number", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Price",
      });

      openBinningListForDimension("Price", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should work for longitude", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Longitude",
      });

      openBinningListForDimension("Longitude", "Auto binned");
      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
    });
  });

  context.skip("explicit joins (metabase#16675)", () => {
    beforeEach(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("should work for time series", () => {
      chooseInitialBinningOptionForExplicitJoin({
        baseTableQuery: ordersJoinPeopleQuery,
        column: "Birth Date",
      });

      openBinningListForDimension("Birth Date", "by month");
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should work for number", () => {
      chooseInitialBinningOptionForExplicitJoin({
        baseTableQuery: ordersJoinProductsQuery,
        column: "Price",
      });

      openBinningListForDimension("Price", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should work for longitude", () => {
      chooseInitialBinningOptionForExplicitJoin({
        baseTableQuery: ordersJoinPeopleQuery,
        column: "Longitude",
      });

      openBinningListForDimension("Longitude", "Auto binned");
      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
    });
  });
});

function chooseInitialBinningOption({ table, column, mode = null } = {}) {
  openTable({ table, mode });
  summarize({ mode });

  if (mode === "notebook") {
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText(column).click();
  } else {
    cy.findByTestId("sidebar-right").contains(column).first().click();
  }
}

function chooseInitialBinningOptionForExplicitJoin({
  baseTableQuery,
  column,
} = {}) {
  visitQuestionAdhoc({ dataset_query: baseTableQuery });

  summarize();

  cy.findByTestId("sidebar-right").within(() => {
    cy.findByText("Count"); // Test fails without this because of some weird race condition
    cy.findByText(column).click();
  });
}

function openBinningListForDimension(column, binning) {
  getBinningButtonForDimension({ name: column, isSelected: true })
    .should("contain", binning)
    .click();
}

function getTitle(title) {
  cy.findByText(title);
}

function getAllOptions({ options, isSelected, shouldExpandList } = {}) {
  const selectedOption = options.find(option => option === isSelected);
  const regularOptions = options.filter(option => option !== isSelected);

  // Custom question has two popovers open.
  // The binning options are in the latest (last) one.
  // Using `.last()` works even when only one popover is open so it covers both scenarios.
  popover()
    .last()
    .within(() => {
      if (shouldExpandList) {
        cy.findByText("More…").click();
      }

      regularOptions.forEach(option => {
        // Implicit assertion - will fail if string is rendered multiple times
        cy.findByText(option);
      });

      isSelected &&
        cy
          .findByText(selectedOption)
          .closest("li")
          .should("have.attr", "aria-selected", "true");
    });
}

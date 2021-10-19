import {
  restore,
  popover,
  openTable,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const {
  ORDERS_ID,
  ORDERS,
  PEOPLE_ID,
  PEOPLE,
  PRODUCTS_ID,
  PRODUCTS,
} = SAMPLE_DATASET;

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
  database: 1,
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
  database: 1,
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
  "Minute of Hour",
  "Hour of Day",
  "Day of Week",
  "Day of Month",
  "Day of Year",
  "Week of Year",
  "Month of Year",
  "Quarter of Year",
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
 */

describe("scenarios > binning > binning options", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  context("via simple question", () => {
    it("should render number binning options correctly", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Total" });
      getTitle("Count by Total: Auto binned");

      openPopoverFromSelectedBinningOption("Total", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should render time series binning options correctly", () => {
      chooseInitialBinningOption({ table: ORDERS_ID, column: "Created At" });
      getTitle("Count by Created At: Month");

      openPopoverFromSelectedBinningOption("Created At", "by month");
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should render longitude/latitude binning options correctly", () => {
      chooseInitialBinningOption({ table: PEOPLE_ID, column: "Longitude" });
      getTitle("Count by Longitude: Auto binned");

      openPopoverFromSelectedBinningOption("Longitude", "Auto binned");
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

      cy.findByText("Total: Auto binned").click();
      openPopoverFromSelectedBinningOption("Total", "Auto binned");

      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should render time series binning options correctly", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        mode: "notebook",
        column: "Created At",
      });

      getTitle("Count by Created At: Month");

      cy.findByText("Created At: Month").click();
      openPopoverFromSelectedBinningOption("Created At", "by month");

      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should render longitude/latitude binning options correctly", () => {
      chooseInitialBinningOption({
        table: PEOPLE_ID,
        mode: "notebook",
        column: "Longitude",
      });

      getTitle("Count by Longitude: Auto binned");

      cy.findByText("Longitude: Auto binned").click();
      openPopoverFromSelectedBinningOption("Longitude", "Auto binned");

      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
    });
  });

  context("via time series footer", () => {
    it("should render time series binning options correctly", () => {
      openTable({ table: ORDERS_ID });
      cy.findByText("Created At").click();
      cy.findByText("Distribution").click();

      getTitle("Count by Created At: Month");

      // Check all binning options from the footer
      cy.get(".AdminSelect-content")
        .contains("Month")
        .click();
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });
  });

  context.skip("implicit joins (metabase#16674)", () => {
    it("should work for time series", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Birth Date",
      });

      openPopoverFromSelectedBinningOption("Birth Date", "by month");
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should work for number", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Price",
      });

      openPopoverFromSelectedBinningOption("Price", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should work for longitude", () => {
      chooseInitialBinningOption({
        table: ORDERS_ID,
        column: "Longitude",
      });

      openPopoverFromSelectedBinningOption("Longitude", "Auto binned");
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

      openPopoverFromSelectedBinningOption("Birth Date", "by month");
      getAllOptions({ options: TIME_BUCKETS, isSelected: "Month" });
    });

    it("should work for number", () => {
      chooseInitialBinningOptionForExplicitJoin({
        baseTableQuery: ordersJoinProductsQuery,
        column: "Price",
      });

      openPopoverFromSelectedBinningOption("Price", "Auto binned");
      getAllOptions({ options: NUMBER_BUCKETS, isSelected: "Auto bin" });
    });

    it("should work for longitude", () => {
      chooseInitialBinningOptionForExplicitJoin({
        baseTableQuery: ordersJoinPeopleQuery,
        column: "Longitude",
      });

      openPopoverFromSelectedBinningOption("Longitude", "Auto binned");
      getAllOptions({ options: LONGITUDE_BUCKETS, isSelected: "Auto bin" });
    });
  });
});

function chooseInitialBinningOption({ table, column, mode = null } = {}) {
  openTable({ table, mode });
  cy.findByText("Summarize").click();

  if (mode === "notebook") {
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText(column).click();
  } else {
    cy.findByTestId("sidebar-right")
      .contains(column)
      .first()
      .click();
  }
}

function chooseInitialBinningOptionForExplicitJoin({
  baseTableQuery,
  column,
} = {}) {
  visitQuestionAdhoc({ dataset_query: baseTableQuery });

  cy.wait("@dataset");
  cy.findByText("Summarize")
    .should("be.visible")
    .click();

  cy.findByTestId("sidebar-right").within(() => {
    cy.findByText("Count"); // Test fails without this because of some weird race condition
    cy.findByText(column).click();
  });
}

function openPopoverFromSelectedBinningOption(column, binning) {
  cy.get(".List-item--selected")
    .should("be.visible")
    .as("targetListItem")
    .should("contain", column);

  cy.get("@targetListItem")
    .find(".Field-extra")
    .as("listItemSelectedBinning")
    .should("contain", binning)
    .click();
}

function getTitle(title) {
  cy.findByText(title);
}

function getAllOptions({ options, isSelected } = {}) {
  const selectedOption = options.find(option => option === isSelected);
  const regularOptions = options.filter(option => option !== isSelected);

  // Custom question has two popovers open.
  // The binning options are in the latest (last) one.
  // Using `.last()` works even when only one popover is open so it covers both scenarios.
  popover()
    .last()
    .within(() => {
      regularOptions.forEach(option => {
        // Implicit assertion - will fail if string is rendered multiple times
        cy.findByText(option);
      });

      isSelected &&
        cy
          .findByText(selectedOption)
          .closest("li")
          .should("have.class", "List-item--selected");
    });
}

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addCustomColumn,
  restore,
  popover,
  openOrdersTable,
  expressionEditorWidget,
  openTable,
  describeWithSnowplow,
  expectNoBadSnowplowEvents,
  expectGoodSnowplowEvent,
  resetSnowplow,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const DATE_EXTRACTIONS = [
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Hour of day",
    fn: "hour",
  },
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Day of month",
    fn: "day",
  },
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Day of week",
    fn: "weekday",
  },
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Month of year",
    fn: "month",
  },
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Quarter of year",
    fn: "quarter",
  },
  {
    table: ORDERS_ID,
    column: "Created At",
    name: "Year",
    fn: "year",
  },
];

const EMAIL_EXTRACTIONS = [
  {
    table: ORDERS_ID,
    column: "Email",
    name: "Domain",
    fn: "domain",
  },
  {
    table: ORDERS_ID,
    column: "Email",
    name: "Host",
    fn: "host",
  },
];

const URL_EXRACTIONS = [
  {
    table: ORDERS_ID,
    column: "Product ID",
    name: "Domain",
    fn: "domain",
  },
  {
    table: ORDERS_ID,
    column: "Product ID",
    name: "Subdomain",
    fn: "subdomain",
  },
  {
    table: ORDERS_ID,
    column: "Product ID",
    name: "Host",
    fn: "host",
  },
];

const EXTRACTIONS = [
  ...EMAIL_EXTRACTIONS,
  ...DATE_EXTRACTIONS,
  ...URL_EXRACTIONS,
];

describe("scenarios > question > custom column > expression shortcuts > extract", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    // Make the PRODUCT_ID column a URL column for these tests, to avoid having to create a new model
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/URL",
    });
  });

  for (const extraction of EXTRACTIONS) {
    it(`should be possible to use the ${extraction.name} extraction on ${extraction.column}`, () => {
      openTable({ mode: "notebook", limit: 1, table: extraction.table });
      addCustomColumn();
      selectExtractColumn();

      cy.findAllByTestId("dimension-list-item")
        .contains(extraction.column)
        .click();
      popover().findAllByRole("button").contains(extraction.name).click();

      cy.findByTestId("expression-editor-textfield").should(
        "contain",
        `${extraction.fn}(`,
      );

      expressionEditorWidget()
        .findByTestId("expression-name")
        .should("have.value", extraction.name);
    });
  }

  it("should be possible to create the same extraction multiple times", () => {
    openOrdersTable({ mode: "notebook", limit: 5 });
    addCustomColumn();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    popover().findAllByRole("button").contains("Hour of day").click();

    expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day");

    expressionEditorWidget().button("Done").click();

    cy.findAllByTestId("notebook-cell-item").last().click();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    popover().findAllByRole("button").contains("Hour of day").click();

    expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day (1)");
  });

  it("should be possible to edit a previous stages' columns when an aggregation is present (metabase#43226)", () => {
    openOrdersTable({ mode: "notebook", limit: 5 });

    cy.button("Summarize").click();
    popover().findByText("Count of rows").click();

    addCustomColumn();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    popover().findAllByRole("button").contains("Hour of day").click();

    expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day");
  });
});

function selectExtractColumn() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Extract columns").click();
  });
}

describeWithSnowplow(
  "scenarios > question > custom column > expression shortcuts > extract",
  () => {
    beforeEach(() => {
      restore();
      resetSnowplow();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should track column extraction via shortcut", () => {
      openTable({ mode: "notebook", limit: 1, table: ORDERS_ID });
      addCustomColumn();
      selectExtractColumn();

      cy.findAllByTestId("dimension-list-item").contains("Created At").click();

      popover().findAllByRole("button").contains("Hour of day").click();

      expectGoodSnowplowEvent({
        event: "column_extract_via_shortcut",
        custom_expressions_used: ["get-hour"],
        database_id: SAMPLE_DB_ID,
        question_id: 0,
      });
    });
  },
);

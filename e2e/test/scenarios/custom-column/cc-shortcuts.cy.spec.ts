const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

function selectExtractColumn() {
  H.popover().findByText("Extract columns").click();
}

describe("scenarios > question > custom column > expression shortcuts > extract", () => {
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

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    // Make the PRODUCT_ID column a URL column for these tests, to avoid having to create a new model
    cy.request("PUT", `/api/field/${ORDERS.PRODUCT_ID}`, {
      semantic_type: "type/URL",
    });
  });

  for (const extraction of EXTRACTIONS) {
    it(`should be possible to use the ${extraction.name} extraction on ${extraction.column}`, () => {
      H.openTable({ mode: "notebook", limit: 1, table: extraction.table });
      H.addCustomColumn();
      selectExtractColumn();

      cy.findAllByTestId("dimension-list-item")
        .contains(extraction.column)
        .click();
      H.popover().findAllByRole("button").contains(extraction.name).click();

      H.CustomExpressionEditor.value().should("contain", `${extraction.fn}(`);

      H.expressionEditorWidget()
        .findByTestId("expression-name")
        .should("have.value", extraction.name);
    });
  }

  it("should be possible to create the same extraction multiple times", () => {
    H.openOrdersTable({ mode: "notebook", limit: 5 });
    H.addCustomColumn();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    H.popover().findAllByRole("button").contains("Hour of day").click();

    H.expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day");

    H.expressionEditorWidget().button("Done").click();

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("notebook-cell-item").last().click();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    H.popover().findAllByRole("button").contains("Hour of day").click();

    H.expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day (1)");
  });

  it("should be possible to edit a previous stages' columns when an aggregation is present (metabase#43226)", () => {
    H.openOrdersTable({ mode: "notebook", limit: 5 });

    cy.button("Summarize").click();
    H.popover().findByText("Count of rows").click();

    // add custom column
    cy.findAllByTestId("action-buttons").first().icon("add_data").click();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();
    H.popover().findAllByRole("button").contains("Hour of day").click();

    H.expressionEditorWidget()
      .findByTestId("expression-name")
      .should("have.value", "Hour of day");
  });
});

describe("scenarios > question > custom column > expression shortcuts > extract", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsNormalUser();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should track column extraction via shortcut", () => {
    H.openTable({ mode: "notebook", limit: 1, table: ORDERS_ID });
    H.addCustomColumn();
    selectExtractColumn();

    cy.findAllByTestId("dimension-list-item").contains("Created At").click();

    H.popover().findAllByRole("button").contains("Hour of day").click();

    H.expectUnstructuredSnowplowEvent({
      event: "column_extract_via_shortcut",
      custom_expressions_used: ["get-hour"],
      database_id: SAMPLE_DB_ID,
      question_id: 0,
    });
  });
});

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  addCustomColumn,
  restore,
  popover,
  openOrdersTable,
  expressionEditorWidget,
  openTable,
} from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

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

const EXTRACTIONS = [...EMAIL_EXTRACTIONS, ...DATE_EXTRACTIONS];

describe("scenarios > question > custom column > expression shortcuts > extract", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
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
});

function selectExtractColumn() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Extract columns").click();
  });
}

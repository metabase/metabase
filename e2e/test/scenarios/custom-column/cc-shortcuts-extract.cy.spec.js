import {
  addCustomColumn,
  restore,
  popover,
  openOrdersTable,
  expressionEditorWidget,
} from "e2e/support/helpers";

const DATE_EXTRACTIONS = [
  {
    column: "Created At",
    name: "Hour of day",
    fn: "hour",
  },
  {
    column: "Created At",
    name: "Day of month",
    fn: "day",
  },
  {
    column: "Created At",
    name: "Day of week",
    fn: "weekday",
  },
  {
    column: "Created At",
    name: "Month of year",
    fn: "month",
  },
  {
    column: "Created At",
    name: "Quarter of year",
    fn: "quarter",
  },
  {
    column: "Created At",
    name: "Year",
    fn: "year",
  },
];

const URL_EXTRACTIONS = [];
const EXTRACTIONS = [...URL_EXTRACTIONS, ...DATE_EXTRACTIONS];

describe("scenarios > question > custom column > expression shortcuts > extract", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  for (const extraction of EXTRACTIONS) {
    it(`should be possible to use the ${extraction.name} extraction on ${extraction.column}`, () => {
      openOrdersTable({ mode: "notebook", limit: 1 });
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

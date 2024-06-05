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

function selectExtractColumn() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Extract columns").click();
  });
}

function selectCombineColumns() {
  cy.findByTestId("expression-suggestions-list").within(() => {
    cy.findByText("Combine columns").click();
  });
}

function selectColumn(table, name) {
  expressionEditorWidget().within(() => {
    cy.findAllByText("Select a column...").first().click();
  });

  popover()
    .last()
    .within(() => {
      if (name) {
        // both table and name were given
        cy.findByText(table).click();
        cy.findByText(name).click();
      } else {
        cy.findByText(table).click();
      }
    });
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

describe("scenarios > question > custom column > expression shortcuts > combine", () => {
  function addColumn() {
    expressionEditorWidget().within(() => {
      cy.findByText("Add column").click();
    });
  }

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to select a combine columns shortcut", () => {
    openOrdersTable({ mode: "notebook", limit: 5 });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("Total");

    expressionEditorWidget().findByText("Total").should("exist");

    selectColumn("Product", "Rating");

    expressionEditorWidget().within(() => {
      cy.findByText("Product → Rating").should("exist");

      cy.findByTestId("combine-example").should(
        "have.text",
        "123.45678901234567 123.45678901234567",
      );

      cy.findByText(/Separated by/).click();
      cy.findByLabelText("Separator").type("__");

      cy.findByTestId("combine-example").should(
        "have.text",
        "123.45678901234567__123.45678901234567",
      );

      cy.button("Done").click();

      cy.findByTestId("expression-editor-textfield").should(
        "contain",
        'concat([Total], "__", [Product → Rating])',
      );
      cy.findByTestId("expression-name").should(
        "have.value",
        "Combined Total, Rating",
      );
    });
  });

  it("should be possible to cancel when using the combine column shortcut", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("Total");
    selectColumn("Product", "Rating");

    expressionEditorWidget().within(() => {
      // Click the back button, in the header
      cy.findByText("Select columns to combine").click();
    });

    cy.get(".ace_text-input").should("have.value", "\n\n");
    cy.findByTestId("expression-name").should("have.value", "");
  });

  it("should be possible to add and remove more than one column", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("Total");
    selectColumn("Product", "Rating");
    addColumn();
    selectColumn("User", "Email");

    cy.findByTestId("combine-example").should(
      "contain",
      "123.45678901234567 123.45678901234567 email@example.com",
    );

    cy.findAllByLabelText("Remove column").last().click();

    cy.findByTestId("combine-example").should(
      "contain",
      "123.45678901234567 123.45678901234567",
    );
  });

  it("should pick the correct default separator based on the type of the first column", () => {
    openOrdersTable({ mode: "notebook" });
    addCustomColumn();
    selectCombineColumns();

    selectColumn("User", "Email");

    expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });

  it("should be possible to edit a previous stages' columns when there is an aggregation (metabase#43226)", () => {
    openOrdersTable({ mode: "notebook" });

    cy.button("Summarize").click();

    popover().findByText("Count of rows").click();

    addCustomColumn();
    selectCombineColumns();

    selectColumn("User", "Email");

    expressionEditorWidget().within(() => {
      cy.findByText("Separated by (empty)").should("exist");
      cy.findByText(/Separated by/).click();

      cy.findByLabelText("Separator").should("have.value", "");
    });
  });
});

describeWithSnowplow(
  "scenarios > question > custom column > combine shortcuts",
  () => {
    beforeEach(() => {
      restore();
      resetSnowplow();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      expectNoBadSnowplowEvents();
    });

    it("should send an event for combine columns", () => {
      openOrdersTable({ mode: "notebook" });
      addCustomColumn();
      selectCombineColumns();

      selectColumn("User", "Email");
      selectColumn("User", "Email");

      expressionEditorWidget().button("Done").click();

      expectGoodSnowplowEvent({
        event: "column_combine_via_shortcut",
        custom_expressions_used: ["concat"],
        database_id: SAMPLE_DB_ID,
        question_id: 0,
      });
    });
  },
);

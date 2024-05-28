import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  visualize,
  openTable,
  openOrdersTable,
  popover,
  modal,
  summarize,
  openNativeEditor,
  startNewQuestion,
  openNavigationSidebar,
  navigationSidebar,
  entityPickerModal,
  entityPickerModalTab,
  withDatabase,
  adhocQuestionHash,
  expressionEditorWidget,
  enterCustomColumnDetails,
  showDashboardCardActions,
  filterWidget,
  saveDashboard,
  editDashboard,
  visitDashboard,
  openColumnOptions,
  questionInfoButton,
  rightSidebar,
  getNotebookStep,
  leftSidebar,
  POPOVER_ELEMENT,
  appBar,
  visitQuestion,
  openProductsTable,
  mockSessionProperty,
  visitQuestionAdhoc,
  sidebar,
  openNotebook,
  selectFilterOperator,
  chartPathWithFillColor,
  openQuestionActions,
  queryBuilderHeader,
  describeOSS,
  cartesianChartCircle,
  filter,
  moveColumnDown,
  getDraggableElements,
  resetTestTable,
  getTable,
  resyncDatabase,
  createQuestion,
} from "e2e/support/helpers";

import { setAdHocFilter } from "../native-filters/helpers/e2e-date-filter-helpers";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  SAMPLE_DB_ID,
  PEOPLE,
} = SAMPLE_DATABASE;

const QUESTION_NAME = "Foo";
const MONGO_DB_ID = 2;

describe("issue 4482", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openTable({
      table: PRODUCTS_ID,
      mode: "notebook",
    });

    cy.findByRole("button", { name: "Summarize" }).click();
  });

  it("should be possible to summarize min of a temporal column (metabase#4482-1)", () => {
    pickMetric("Minimum of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Created At").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 1, 2022, 12:00 AM");
  });

  it("should be possible to summarize max of a temporal column (metabase#4482-2)", () => {
    pickMetric("Maximum of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Created At").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("April 1, 2025, 12:00 AM");
  });

  it("should be not possible to average a temporal column (metabase#4482-3)", () => {
    pickMetric("Average of");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").should("not.exist");
  });
});

function pickMetric(metric) {
  cy.contains("Pick the metric").click();

  cy.contains(metric).click();
  cy.findByText("Price");
  cy.findByText("Rating");
}

describe("issue 6239", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openOrdersTable({ mode: "notebook" });

    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();

    cy.get(".ace_text-input").type("CountIf([Total] > 0)").blur();

    cy.findByPlaceholderText("Something nice and descriptive").type("CE");
    cy.button("Done").click();

    cy.findByTestId("aggregate-step").contains("CE").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().contains("Created At").first().click();
  });

  it("should be possible to sort by using custom expression (metabase#6239)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sort").click();
    popover().contains(/^CE$/).click();

    visualize();

    // Line chart renders initially. Switch to the table view.
    cy.icon("table2").click();

    cy.get("[data-testid=cell-data]")
      .eq(1)
      .should("contain", "CE")
      .and("have.descendants", ".Icon-chevronup");

    cy.get("[data-testid=cell-data]").eq(3).invoke("text").should("eq", "1");

    // Go back to the notebook editor
    cy.icon("notebook").click();

    // Sort descending this time
    cy.icon("arrow_up").click();
    cy.icon("arrow_up").should("not.exist");
    cy.icon("arrow_down");

    visualize();

    cy.get("[data-testid=cell-data]")
      .eq(1)
      .should("contain", "CE")
      .and("have.descendants", ".Icon-chevrondown");

    cy.get("[data-testid=cell-data]").eq(3).invoke("text").should("eq", "584");
  });
});

describe("issue 9027", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Saved questions").click();
      cy.findByText("Orders").should("exist");
      cy.button("Close").click();
    });

    openNativeEditor({ fromCurrentPage: true });

    cy.get(".ace_content").type("select 0");
    cy.findByTestId("native-query-editor-container").icon("play").click();

    saveQuestion(QUESTION_NAME);
  });

  it("should display newly saved question in the 'Saved Questions' list immediately (metabase#9027)", () => {
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
    openNavigationSidebar();
    archiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME, false);
    openNavigationSidebar();
    unarchiveQuestion(QUESTION_NAME);
    goToSavedQuestionPickerAndAssertQuestion(QUESTION_NAME);
  });
});

function goToSavedQuestionPickerAndAssertQuestion(questionName, exists = true) {
  startNewQuestion();
  entityPickerModal().within(() => {
    entityPickerModalTab("Saved questions").click();
    cy.findByText(questionName).should(exists ? "exist" : "not.exist");
    cy.button("Close").click();
  });
}

function saveQuestion(name) {
  cy.intercept("POST", "/api/card").as("saveQuestion");
  cy.findByText("Save").click();

  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByLabelText("Name").clear().type(name);
    cy.findByText("Save").click();
  });

  cy.button("Not now").click();
  cy.wait("@saveQuestion");
}

function archiveQuestion(questionName) {
  navigationSidebar().findByText("Our analytics").click();
  openEllipsisMenuFor(questionName);
  popover().findByText("Move to trash").click();
}

function unarchiveQuestion(questionName) {
  navigationSidebar().within(() => {
    cy.findByText("Trash").click();
  });
  openEllipsisMenuFor(questionName);
  popover().findByText("Restore").click();
}

function openEllipsisMenuFor(item) {
  cy.findByText(item)
    .closest("tr")
    .find(".Icon-ellipsis")
    .click({ force: true });
}

describe("issue 13097", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();

    withDatabase(MONGO_DB_ID, ({ PEOPLE_ID }) => {
      const questionDetails = {
        dataset_query: {
          type: "query",
          query: { "source-table": PEOPLE_ID, limit: 5 },
          database: MONGO_DB_ID,
        },
      };

      const hash = adhocQuestionHash(questionDetails);

      cy.visit(`/question/notebook#${hash}`);
    });
  });

  it("should correctly apply distinct count on multiple columns (metabase#13097)", () => {
    summarize({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Number of distinct values of ...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("City").click();

    cy.findAllByTestId("notebook-cell-item").find(".Icon-add").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Number of distinct values of ...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("State").click();

    visualize();

    // cy.log("Reported failing on stats ~v0.36.3");
    cy.get("[data-testid=cell-data]")
      .should("have.length", 4)
      .and("contain", "Distinct values of City")
      .and("contain", "1,966")
      .and("contain", "Distinct values of State")
      .and("contain", "49");
  });
});

describe("postgres > user > query", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
        });
      },
    );
  });

  it("should show row details when clicked on its entity key (metabase#13263)", () => {
    // We're clicking on ID: 1 (the first order) => do not change!
    // It is tightly coupled to the assertion ("37.65"), which is "Subtotal" value for that order.
    cy.get(".test-Table-ID").eq(0).click();

    // Wait until "doing science" spinner disappears (DOM is ready for assertions)
    // TODO: if this proves to be reliable, extract it as a helper function for waiting on DOM to render
    cy.findByTestId("loading-spinner").should("not.exist");

    // Assertions
    cy.log("Fails in v0.36.6");
    // This could be omitted because real test is searching for "37.65" on the page
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("There was a problem with your question").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

const PG_DB_NAME = "QA Postgres12";

describe.skip("issue 14957", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should save a question before query has been executed (metabase#14957)", () => {
    openNativeEditor({ databaseName: PG_DB_NAME }).type("select pg_sleep(60)");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();

    cy.findByLabelText("Name").type("14957");
    cy.button("Save").click();

    modal().should("not.exist");
  });
});

describe("postgres > question > custom columns", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/public`).then(
      ({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          mode: "notebook",
        });
      },
    );

    cy.findByRole("button", { name: "Summarize" }).click();
  });

  it("`Percentile` custom expression function should accept two parameters (metabase#15714)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick the metric you want to see").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    enterCustomColumnDetails({ formula: "Percentile([Subtotal], 0.1)" });
    cy.findByPlaceholderText("Something nice and descriptive")
      .as("name")
      .click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Function Percentile expects 1 argument").should("not.exist");
    cy.get("@name").type("Expression name");
    cy.button("Done").should("not.be.disabled").click();
    // Todo: Add positive assertions once this is fixed

    cy.findByTestId("aggregate-step")
      .contains("Expression name")
      .should("exist");
  });
});

const PG_DB_ID = 2;

const questionDetails = {
  native: {
    query: `select mytz as "ts", mytz::text as "tsAStext", state, mytz::time as "time - LOOK AT THIS COLUMN", mytz::time::text as "timeAStext", mytz::time(0) as "time(0) - ALL INCORRECT", mytz::time(3) as "time(3) - MOSTLY WORKING" from (
      select '2022-05-04 16:29:59.268160-04:00'::timestamptz as mytz, 'incorrect' AS state union all
      select '2022-05-04 16:29:59.412459-04:00'::timestamptz, 'good' union all
      select '2022-05-08 13:14:42.926221-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-08 13:14:42.132026-04:00'::timestamptz, 'good' union all
      select '2022-05-10 07:38:58.987352-04:00'::timestamptz, 'incorrect' union all
      select '2022-05-10 07:38:58.001001-04:00'::timestamptz, 'good' union all
      select '2022-05-12 11:01:23.000000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23.000-04:00'::timestamptz, 'ALWAYS incorrect' union all
      select '2022-05-12 11:01:23-04:00'::timestamptz, 'ALWAYS incorrect'
  )x`,
  },
  database: PG_DB_ID,
};

// time, time(0), time(3)
const castColumns = 3;

const correctValues = [
  {
    value: "1:29 PM",
    rows: 2,
  },
  {
    value: "10:14 AM",
    rows: 2,
  },
  {
    value: "4:38 AM",
    rows: 2,
  },
  {
    value: "8:01 AM",
    rows: 3,
  },
];

describe("issue 15876", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should correctly cast to `TIME` (metabase#15876)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("query-visualization-root").within(() => {
      correctValues.forEach(({ value, rows }) => {
        const count = rows * castColumns;

        cy.findAllByText(value).should("have.length", count);
      });
    });
  });
});

describe("issue 17512", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();
  });

  it("custom expression should work with `case` in nested queries (metabase#17512)", () => {
    openOrdersTable({ mode: "notebook" });

    addSummarizeCustomExpression(
      "Distinct(case([Discount] > 0, [Subtotal], [Total]))",
      "CE",
    );

    cy.findByTestId("aggregate-step").contains("CE").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    addCustomColumn("1 + 1", "CC");

    visualize(({ body }) => {
      expect(body.error).to.not.exist;
    });

    cy.findAllByTestId("header-cell").contains("CE").should("exist");
    cy.findAllByTestId("header-cell").contains("CC").should("exist");
  });
});

function addSummarizeCustomExpression(formula, name) {
  summarize({ mode: "notebook" });
  popover().contains("Custom Expression").click();

  expressionEditorWidget().within(() => {
    enterCustomColumnDetails({
      formula,
      name,
    });
    cy.button("Done").click();
  });
}

function addCustomColumn(formula, name) {
  cy.findByText("Custom column").click();
  expressionEditorWidget().within(() => {
    enterCustomColumnDetails({
      formula,
      name,
    });
    cy.button("Done").click();
  });
}

describe("issue 17514", () => {
  const questionDetails = {
    name: "17514",
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
    },
  };

  const filter = {
    name: "Date Filter",
    slug: "date_filter",
    id: "23ccbbf",
    type: "date/all-options",
    sectionId: "date",
  };

  const dashboardDetails = { parameters: [filter] };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("scenario 1", () => {
    beforeEach(() => {
      cy.createQuestionAndDashboard({
        questionDetails,
        dashboardDetails,
      }).then(({ body: card }) => {
        const { card_id, dashboard_id } = card;

        cy.intercept(
          "POST",
          `/api/dashboard/${dashboard_id}/dashcard/*/card/${card_id}/query`,
        ).as("cardQuery");

        const mapFilterToCard = {
          parameter_mappings: [
            {
              parameter_id: filter.id,
              card_id,
              target: ["dimension", ["field", ORDERS.CREATED_AT, null]],
            },
          ],
        };

        cy.editDashboardCard(card, mapFilterToCard);

        visitDashboard(dashboard_id);

        cy.wait("@cardQuery");
        cy.findByText("110.93").should("be.visible");
      });
    });

    it("should not show the run overlay when we apply dashboard filter on a question with removed column and then click through its title (metabase#17514-1)", () => {
      editDashboard();

      openVisualizationOptions();

      hideColumn("Products → Ean");

      closeModal();

      saveDashboard();

      filterWidget().click();
      setAdHocFilter({ timeBucket: "years" });

      cy.location("search").should("eq", "?date_filter=past30years");
      cy.wait("@cardQuery");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Previous 30 Years");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("17514").click();
      cy.wait("@dataset");
      cy.findByTextEnsureVisible("Subtotal");

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("79.37").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter by this value");
    });
  });

  describe("scenario 2", () => {
    beforeEach(() => {
      cy.createQuestion(questionDetails, { visitQuestion: true });

      cy.findByTestId("viz-settings-button").click();

      moveColumnToTop("Subtotal");

      openNotebookMode();

      removeJoinedTable();

      cy.button("Visualize").click();
      cy.wait("@dataset");

      cy.findByTextEnsureVisible("Subtotal");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      cy.findByTestId("save-question-modal").within(modal => {
        cy.findByText("Save").click();
      });

      cy.findByTestId("save-question-modal").should("not.exist");
    });

    it("should not show the run overlay because of the references to the orphaned fields (metabase#17514-2)", () => {
      openNotebookMode();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Join data").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });

      cy.button("Visualize").click();

      // wait until view results are done rendering
      cy.wait("@dataset");
      cy.findByTestId("query-builder-main").within(() => {
        cy.findByText("Doing science...").should("not.exist");
      });

      // Cypress cannot click elements that are blocked by an overlay so this will immediately fail if the issue is not fixed
      openColumnOptions("Subtotal");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Filter by this column");
    });
  });
});

function openVisualizationOptions() {
  showDashboardCardActions();
  cy.icon("palette").click({ force: true });
}

function hideColumn(columnName) {
  cy.findByTestId("chartsettings-sidebar").within(() => {
    cy.findByText(columnName).siblings("[data-testid$=hide-button]").click();
  });
}

function closeModal() {
  modal().within(() => {
    cy.button("Done").click();
  });
}

function openNotebookMode() {
  cy.icon("notebook").click();
}

function removeJoinedTable() {
  cy.findAllByText("Join data")
    .first()
    .parent()
    .findByLabelText("Remove step")
    .click({ force: true });
}

function moveColumnToTop(column) {
  cy.findByTestId("sidebar-left").within(() => {
    cy.findByText(column)
      .should("be.visible")
      .closest("[data-testid^=draggable-item]")
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 0, -600, { force: true })
      .trigger("mouseup", 0, -600, { force: true });
  });
}

describe("issue 17910", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("revisions should work after creating a question without reloading (metabase#17910)", () => {
    openOrdersTable();
    cy.intercept("POST", "/api/card").as("card");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@card");

    cy.get("#QuestionSavedModal").within(() => {
      cy.findByText("Not now").click();
    });

    questionInfoButton().click();

    rightSidebar().within(() => {
      cy.findAllByPlaceholderText("Add description")
        .type("A description")
        .blur();
      cy.findByText("History");
      cy.findByTestId("saved-question-history-list")
        .children()
        .should("have.length", 2);
    });
  });
});

describe("issue 17963", { tags: "@mongo" }, () => {
  beforeEach(() => {
    restore("mongo-5");
    cy.signInAsAdmin();

    cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
      const tableId = body.find(table => table.name === "orders").id;
      openTable({
        database: WRITABLE_DB_ID,
        table: tableId,
        mode: "notebook",
      });
    });
  });

  it("should be able to compare two fields using filter expression (metabase#17963)", () => {
    cy.findByRole("button", { name: "Filter" }).click();

    popover().contains("Custom Expression").click();

    typeAndSelect([
      { string: "dis", field: "Discount" },
      { string: "> quan", field: "Quantity" },
    ]);

    cy.get(".ace_text-input").blur();
    cy.button("Done").click();

    getNotebookStep("filter").findByText("Discount is greater than Quantity");

    cy.findByRole("button", { name: "Summarize" }).click();
    popover().findByText("Count of rows").click();

    visualize();

    cy.findByTestId("scalar-value").contains("1,337");
  });
});

function typeAndSelect(arr) {
  arr.forEach(({ string, field }) => {
    cy.get(".ace_text-input").type(string);

    popover().contains(field).click();
  });
}

describe("issue 18207", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    openProductsTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
  });

  it("should be possible to use MIN on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Minimum of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Category").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey");
  });

  it("should be possible to use MAX on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Maximum of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Category").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Widget");
  });

  it("should be not possible to use AVERAGE on a string column (metabase#18207, metabase#22155)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Average of").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Price");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Rating");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Ean").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").should("not.exist");
  });

  it("should be possible to group by a string expression (metabase#18207)", () => {
    popover().contains("Custom Expression").click();
    expressionEditorWidget().within(() => {
      enterCustomColumnDetails({
        formula: "Max([Vendor])",
        name: "LastVendor",
      });
      cy.findByText("Done").click();
    });

    cy.findByTestId("aggregate-step").contains("LastVendor").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Pick a column to group by").click();
    popover().contains("Category").click();

    visualize();

    // Why is it not a table?
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    leftSidebar().within(() => {
      cy.icon("table2").click();
      cy.findByTestId("Table-button").realHover();
      cy.icon("gear").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Done").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Zemlak-Wiegand");
  });
});

describe("11914, 18978, 18977", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion({
      query: {
        "source-table": `card__${ORDERS_QUESTION_ID}`,
        limit: 2,
      },
    }).then(({ body: { id: questionId } }) => {
      cy.signIn("nodata");
      visitQuestion(questionId);
    });
  });

  it("should not display query editing controls and 'Browse databases' link", () => {
    cy.log(
      "Make sure we don't prompt user to browse databases from the sidebar",
    );
    openNavigationSidebar();
    cy.findByLabelText("Browse databases").should("not.exist");

    cy.log("Make sure we don't prompt user to create a new query");
    appBar().icon("add").click();
    popover().within(() => {
      cy.findByText("Dashboard").should("be.visible");
      cy.findByText("Question").should("not.exist");
      cy.findByText(/SQL query/).should("not.exist");
      cy.findByText("Model").should("not.exist");
    });
    // Click anywhere to close the "new" button popover
    cy.get("body").click("topLeft");

    cy.log(
      "Make sure we don't prompt user to perform any further query manipulations",
    );
    cy.findByTestId("qb-header-action-panel").within(() => {
      // visualization
      cy.icon("refresh").should("be.visible");
      cy.icon("bookmark").should("be.visible");
      // querying
      cy.icon("notebook").should("not.exist");
      cy.findByText("Filter").should("not.exist");
      cy.findByText("Summarize").should("not.exist");
      cy.button("Save").should("not.exist");
    });

    cy.log("Make sure drill-through menus do not appear");
    // No drills when clicking a column header
    cy.findAllByTestId("header-cell").contains("Subtotal").click();
    assertNoOpenPopover();

    // No drills when clicking a regular cell
    cy.findAllByRole("gridcell").contains("37.65").click();
    assertNoOpenPopover();

    // No drills when clicking on a FK
    cy.get(".test-Table-FK").contains("123").click();
    assertNoOpenPopover();

    assertIsNotAdHoc();

    cy.log("Make sure user can change visualization but not save the question");
    cy.findByTestId("viz-type-button").click();
    cy.findByTestId("Number-button").click();
    cy.findByTestId("scalar-value").should("exist");
    assertSaveIsDisabled();

    cy.log("Make sure we don't prompt user to refresh the updated query");
    // Rerunning a query with changed viz settings will make it use the `/dataset` endpoint,
    // so a user will see the "You don't have permission" error
    assertNoRefreshButton();
  });
});

function assertSaveIsDisabled() {
  saveButton().should("have.attr", "aria-disabled", "true");
}

function assertIsNotAdHoc() {
  // Ad-hoc questions have a base64 encoded hash in the URL
  cy.location("hash").should("eq", "");
  saveButton().should("not.exist");
}

function assertNoRefreshButton() {
  cy.findByTestId("qb-header-action-panel").icon("refresh").should("not.exist");
}

function assertNoOpenPopover() {
  cy.get(POPOVER_ELEMENT).should("not.exist");
}

function saveButton() {
  return cy.findByTestId("qb-header").button("Save");
}

describe("issue 19341", () => {
  const TEST_NATIVE_QUESTION_NAME = "Native";

  beforeEach(() => {
    restore();
    mockSessionProperty("enable-nested-queries", false);
    cy.signInAsAdmin();
    cy.createNativeQuestion({
      name: TEST_NATIVE_QUESTION_NAME,
      native: {
        query: "SELECT * FROM products",
      },
    });
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("should correctly disable nested queries (metabase#19341)", () => {
    // Test "Saved Questions" table is hidden in QB data selector
    startNewQuestion();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-spinner").should("not.exist");
      cy.findByText("Orders").should("exist");
      cy.findAllByRole("tab").should("not.exist");

      // Ensure the search doesn't list saved questions
      cy.findByPlaceholderText("Search…").type("Ord");
      cy.findByTestId("loading-spinner").should("not.exist");

      cy.findAllByTestId("result-item").then($result => {
        const searchResults = $result.toArray();
        const modelTypes = new Set(
          searchResults.map(k => k.getAttribute("data-model-type")),
        );

        expect(modelTypes).not.to.include("card");
        expect(modelTypes).to.include("table");
      });

      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    cy.icon("join_left_outer").click();
    entityPickerModal().findAllByRole("tab").should("not.exist");

    // Test "Explore results" button is hidden for native questions
    cy.visit("/collection/root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(TEST_NATIVE_QUESTION_NAME).click();
    cy.wait("@cardQuery");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").should("not.exist");
  });
});

describe("issue 19742", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  // In order to reproduce the issue, it's important to only use in-app links
  // and don't refresh the app state (like by doing cy.visit)
  it("shouldn't auto-close the data selector after a table was hidden", () => {
    cy.visit("/");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();

    popover().findByText("Question").click();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").should("exist");
      cy.button("Close").click();
    });

    openNavigationSidebar();
    cy.icon("gear").click();
    selectFromDropdown("Admin settings");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Table Metadata").click();
    hideTable("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exit admin").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();

      cy.findByText("Orders").should("not.exist");
      cy.findByText("Products").should("exist");
      cy.findByText("Reviews").should("exist");
      cy.findByText("People").should("exist");
    });
  });
});

function selectFromDropdown(optionName) {
  popover().findByText(optionName).click();
}

function hideTable(tableName) {
  cy.findByText(tableName).find(".Icon-eye_crossed_out").click({ force: true });
}

const QUESTION_1 = {
  name: "Q1",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

const QUESTION_2 = {
  name: "Q2",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [
      ["sum", ["field", PRODUCTS.PRICE, { "base-type": "type/Float" }]],
    ],
    breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
  },
};

describe("issue 19893", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it.skip("should display correct join source table when joining visited questions (metabase#19893)", () => {
    cy.createQuestion(QUESTION_1, {
      wrapId: true,
      idAlias: "questionId1",
      visitQuestion: true,
    });
    cy.createQuestion(QUESTION_2, {
      wrapId: true,
      idAlias: "questionId2",
      visitQuestion: true,
    });

    cy.then(function () {
      const { questionId1, questionId2 } = this;

      createQ1PlusQ2Question(questionId1, questionId2).then(
        ({ body: question }) => {
          cy.visit(`/question/${question.id}/notebook`);
        },
      );
    });

    assertQ1PlusQ2Joins();
  });

  it.skip("should display correct join source table when joining non-visited questions (metabase#19893)", () => {
    cy.createQuestion(QUESTION_1, { wrapId: true, idAlias: "questionId1" });
    cy.createQuestion(QUESTION_2, { wrapId: true, idAlias: "questionId2" });

    cy.then(function () {
      const { questionId1, questionId2 } = this;

      createQ1PlusQ2Question(questionId1, questionId2).then(
        ({ body: question }) => {
          cy.visit(`/question/${question.id}/notebook`);
        },
      );
    });

    assertQ1PlusQ2Joins();
  });
});

const createQ1PlusQ2Question = (questionId1, questionId2) => {
  return cy.createQuestion({
    name: "Q1 + Q2",
    query: {
      "source-table": `card__${questionId1}`,
      joins: [
        {
          fields: "all",
          strategy: "left-join",
          alias: "Q2 - Category",
          condition: [
            "=",
            ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            [
              "field",
              PRODUCTS.CATEGORY,
              { "base-type": "type/Text", "join-alias": "Q2 - Category" },
            ],
          ],
          "source-table": `card__${questionId2}`,
        },
      ],
    },
  });
};

const assertQ1PlusQ2Joins = () => {
  getNotebookStep("join").within(() => {
    cy.findAllByTestId("notebook-cell-item").then(items => {
      cy.wrap(items[0]).should("contain", QUESTION_1.name);
      cy.wrap(items[1]).should("contain", QUESTION_2.name);
    });

    cy.findByLabelText("Left column").within(() => {
      cy.findByText(QUESTION_1.name).should("exist");
      cy.findByText("Category").should("exist");
    });

    cy.findByLabelText("Right column").within(() => {
      cy.findByText(QUESTION_2.name).should("exist");
      cy.findByText("Category").should("exist");
    });
  });
};

const foreignKeyColumnName = "Surprisingly long and awesome Product ID";
const newTableName = "Products with a very long name";

describe("issue 20627", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    renameColumn(ORDERS.PRODUCT_ID, foreignKeyColumnName);
    renameTable(PRODUCTS_ID, newTableName);
  });

  it("nested queries should handle long column and/or table names (metabase#20627)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(newTableName).click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText(newTableName).click();

      cy.findByText("Category").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom column").click();
    enterCustomColumnDetails({ formula: "1 + 1", name: "Math" });
    cy.button("Done").click();

    visualize();

    cy.get("[data-testid=cell-data]")
      .should("contain", "Math")
      .and("contain", "Doohickey")
      .and("contain", "3,976");
  });
});

function renameColumn(columnId, name) {
  cy.request("PUT", `/api/field/${columnId}`, { display_name: name });
}

function renameTable(tableId, name) {
  cy.request("PUT", `/api/table/${tableId}`, { display_name: name });
}

describe("issue 20809", () => {
  const questionDetails = {
    name: "20809",
    query: {
      "source-table": REVIEWS_ID,
      filter: [
        "=",
        ["field", PRODUCTS.CATEGORY, { "source-field": REVIEWS.PRODUCT_ID }],
        "Doohickey",
      ],
      aggregation: [["count"]],
      breakout: [["field", REVIEWS.PRODUCT_ID, null]],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      const nestedQuestion = {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            joins: [
              {
                fields: "all",
                "source-table": `card__${id}`,
                condition: [
                  "=",
                  ["field", ORDERS.PRODUCT_ID, null],
                  [
                    "field",
                    REVIEWS.PRODUCT_ID,
                    { "join-alias": `Question ${id}` },
                  ],
                ],
                alias: `Question ${id}`,
              },
            ],
          },
          type: "query",
        },
      };

      visitQuestionAdhoc(nestedQuestion, { mode: "notebook" });
    });
  });

  it("nesting should work on a saved question with a filter to implicit/explicit table (metabase#20809)", () => {
    cy.findByTextEnsureVisible("Custom column").click();

    enterCustomColumnDetails({
      formula: "1 + 1",
      name: "Two",
    });

    cy.button("Done").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("37.65");
  });
});

describe("time-series filter widget", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    openProductsTable();
  });

  it("should properly display All time as the initial filtering (metabase#22247)", () => {
    summarize();

    sidebar().contains("Created At").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();

    popover().within(() => {
      // Implicit assertion: there is only one select button
      cy.findByDisplayValue("All time").should("be.visible");

      cy.button("Apply").should("not.be.disabled");
    });
  });

  it("should allow switching from All time filter", () => {
    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    // switch to previous 30 quarters
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    popover().within(() => {
      cy.findByDisplayValue("All time").click();
    });
    cy.findByTextEnsureVisible("Previous").click();
    cy.findByDisplayValue("days").click();
    cy.findByTextEnsureVisible("quarters").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 30 quarters")
      .should("be.visible");
  });

  it("should stay in-sync with the actual filter", () => {
    cy.findAllByText("Filter").first().click();
    cy.findByTestId("filter-column-Created At").within(() => {
      cy.findByLabelText("More options").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Last 3 months").click();
    cy.button("Apply filters").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 months").click();
    cy.findByDisplayValue("months").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("years").click();
    cy.button("Update filter").click();
    cy.wait("@dataset");

    cy.findAllByText("Summarize").first().click();
    cy.findAllByText("Created At").last().click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Done").click();

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At is in the previous 3 years")
      .should("be.visible");

    cy.findByTestId("timeseries-filter-button").click();
    popover().within(() => {
      cy.findByDisplayValue("Previous").should("be.visible");
      cy.findByDisplayValue("All time").should("not.exist");
      cy.findByDisplayValue("Next").should("not.exist");
    });

    // switch to All time filter
    popover().within(() => {
      cy.findByDisplayValue("Previous").click();
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("All time").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is in the previous 3 years").should("not.exist");
    cy.findByTextEnsureVisible("All time");
  });
});

describe("issue 23023", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: [
              ["field", PRODUCTS.CATEGORY, { "join-alias": "Products" }],
            ],
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        fields: [
          ["field", ORDERS.ID, null],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
      type: "query",
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should show only selected columns in a step preview (metabase#23023)", () => {
    visitQuestionAdhoc(questionDetails);

    openNotebook();

    cy.icon("play").eq(1).click();

    cy.findAllByTestId("header-cell").contains("Products → Category");
    cy.findAllByTestId("header-cell").contains("Tax").should("not.exist");
  });
});

describe("issue 24839: should be able to summarize a nested question based on the source question with aggregations (metabase#24839)", () => {
  const questionDetails = {
    name: "24839",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.QUANTITY, null]],
        ["avg", ["field", ORDERS.TOTAL, null]],
      ],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    display: "line",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails).then(({ body: { id } }) => {
      // Start ad-hoc nested question based on the saved one
      visitQuestionAdhoc({
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${id}` },
          type: "query",
        },
      });
    });
  });

  it("from the notebook GUI (metabase#24839-1)", () => {
    cy.icon("notebook").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Summarize").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Sum of ...").click();
    popover()
      .should("contain", "Sum of Quantity")
      .and("contain", "Average of Total");
  });

  it("from a table header cell (metabase#24839-2)", () => {
    cy.findAllByTestId("header-cell").contains("Average of Total").click();

    popover().contains("Distinct values").click();

    cy.findByTestId("scalar-value").invoke("text").should("eq", "49");

    cy.findByTestId("aggregation-item")
      .invoke("text")
      .should("eq", "Distinct values of Average of Total");
  });
});

describe("issue 25016", () => {
  const questionDetails = {
    display: "table",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-query": {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        aggregation: [["count"]],
        breakout: [["field", "CATEGORY", { "base-type": "type/Text" }]],
      },
    },
    visualization_settings: {
      "table.pivot_column": "CATEGORY",
      "table.cell_column": "count",
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be possible to filter by a column in a multi-stage query (metabase#25016)", () => {
    visitQuestionAdhoc(questionDetails);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category").click();

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });

    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 1 row").should("be.visible");
  });
});

// this is only testable in OSS because EE always has models from auditv2
describeOSS("issue 25144", { tags: "@OSS" }, () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/card").as("createCard");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should show Saved Questions section after creating the first question (metabase#25144)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders question");
    modal().button("Save").click();
    cy.wait("@createCard");
    cy.wait(100);
    modal().button("Not now").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Saved Questions").click();
    popover().findByText("Orders question").should("be.visible");
  });

  it("should show Models section after creation the first model (metabase#24878)", () => {
    cy.visit("/");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Orders").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click();
    modal().findByLabelText("Name").clear().type("Orders model");
    modal().button("Save").click();
    cy.wait("@createCard");
    cy.wait(100);
    modal().button("Not now").click();

    cy.findByLabelText("Move, archive, and more...").click();
    popover().findByText("Turn into a model").click();
    modal().button("Turn this into a model").click();
    cy.wait("@updateCard");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("New").click();
    popover().findByText("Question").click();
    popover().findByText("Models").click();
    popover().findByText("Orders model").should("be.visible");
  });
});

describe("issue 27104", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
        ],
      },
      type: "query",
    },
    display: "bar",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should correctly format the filter operator after the aggregation (metabase#27104)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();
    popover().findByText("Count").click();
    // The following line is the main assertion.
    popover().button("Back").should("have.text", "Count");
    // The rest of the test is not really needed for this reproduction.
    selectFilterOperator("Greater than");
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("0").blur();
      cy.button("Add filter").click();
    });

    visualize();

    cy.findByTestId("qb-filters-panel").findByText("Count is greater than 0");
    // Check bars count
    chartPathWithFillColor("#509EE3").should("have.length", 5);
  });
});

describe("issue 27462", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to select field when double aggregating metabase#27462", () => {
    const questionDetails = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, null]],
        },
      },
      display: "table",
      visualization_settings: {},
    };

    visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    cy.button("Summarize").click();

    cy.findByRole("option", { name: "Sum of ..." }).click();

    popover().within(() => {
      cy.findByRole("option", { name: "Count" }).click();
    });

    cy.button("Visualize").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("200").should("be.visible");
  });
});

describe("issue 28221", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should be able to select see notebook view even if a question custom field metadata is missing#27462", () => {
    const questionName = "Reproduce 28221";
    const customFieldName = "Non-existing field";
    const questionDetails = {
      name: questionName,
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
        expressions: {
          [customFieldName]: ["field", 9999, null],
        },
      },
    };

    cy.createQuestion(questionDetails).then(({ body }) => {
      const questionId = body.id;

      cy.visit(`/question/${questionId}/notebook`);
    });

    cy.findByDisplayValue(questionName).should("be.visible");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(customFieldName).should("be.visible");
  });
});

describe("issue 28599", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();

    cy.createQuestion(
      {
        name: "28599",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
                "temporal-unit": "year",
              },
            ],
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not show time granularity footer after question conversion to a model (metabase#28599)", () => {
    cy.findByTestId("timeseries-chrome").within(() => {
      cy.findByText("View").should("be.visible");
      cy.findByText("All time").should("be.visible");
      cy.findByText("by").should("be.visible");
      cy.findByText("Year").should("be.visible");
    });

    openQuestionActions();
    popover().findByText("Turn into a model").click();
    modal().findByText("Turn this into a model").click();

    cy.wait("@updateCard");

    cy.findByTestId("time-series-mode-bar").should("not.exist");
  });
});

describe("issue 28874", () => {
  const questionDetails = {
    name: "28874",
    display: "pivot",
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ["field", ORDERS.PRODUCT_ID, null],
        ],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should allow to modify a pivot question in the notebook (metabase#28874)", () => {
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").parent().icon("close").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("not.exist");
  });
});

describe("issue 29082", () => {
  const questionDetails = {
    name: "22788",
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: ["=", ["field", ORDERS.USER_ID, null], 1],
      },
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should handle nulls in quick filters (metabase#29082)", () => {
    visitQuestionAdhoc(questionDetails);
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".test-TableInteractive-emptyCell").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("=").click());
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 8 rows").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is empty").should("exist");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is empty").icon("close").click();
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 11 rows").should("exist");

    cy.get(".test-TableInteractive-emptyCell").first().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    popover().within(() => cy.findByText("≠").click());
    cy.wait("@dataset");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Showing 3 rows").should("exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Discount is not empty").should("exist");
  });
});

describe("issue 30165", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/card").as("createQuestion");
    cy.intercept("PUT", "/api/card/*").as("updateQuestion");
  });

  it("should not autorun native queries after updating a question (metabase#30165)", () => {
    openNativeEditor();
    cy.findByTestId("native-query-editor").type("SELECT * FROM ORDERS");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText("Name").clear().type("Q1");
      cy.findByText("Save").click();
    });
    cy.wait("@createQuestion");
    modal().button("Not now").click();

    cy.findByTestId("native-query-editor").type(" WHERE TOTAL < 20");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.findByTestId("native-query-editor").type(" LIMIT 10");
    queryBuilderHeader().findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });
    cy.wait("@updateQuestion");

    cy.get("@dataset.all").should("have.length", 0);
    cy.get("@cardQuery.all").should("have.length", 0);
    cy.findByTestId("query-builder-main")
      .findByText("Here's where your results will appear")
      .should("be.visible");
  });
});

describe("issue 30610", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove stale metadata when saving a new question (metabase#30610)", () => {
    openOrdersTable();
    openNotebook();
    removeSourceColumns();
    saveQuestion("New orders");
    createAdHocQuestion("New orders");
    visualizeAndAssertColumns();
  });

  it("should remove stale metadata when updating an existing question (metabase#30610)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    openNotebook();
    removeSourceColumns();
    updateQuestion();
    createAdHocQuestion("Orders");
    visualizeAndAssertColumns();
  });
});

function updateQuestion() {
  queryBuilderHeader().findByText("Save").click();
  cy.findByTestId("save-question-modal").within(modal => {
    cy.findByText("Save").click();
  });
}

function removeSourceColumns() {
  cy.findByTestId("fields-picker").click();
  popover().findByText("Select none").click();
}

function createAdHocQuestion(questionName) {
  startNewQuestion();
  entityPickerModal().within(() => {
    entityPickerModalTab("Saved questions").click();
    cy.findByText(questionName).click();
  });
  cy.findByTestId("fields-picker").click();
  popover().within(() => {
    cy.findByText("ID").should("be.visible");
    cy.findByText("Total").should("not.exist");
  });
}

function visualizeAndAssertColumns() {
  visualize();
  cy.findByTestId("TableInteractive-root").within(() => {
    cy.findByText("ID").should("exist");
    cy.findByText("Total").should("not.exist");
  });
}

const EXPRESSION_NAME = "TEST_EXPRESSION";

describe("Custom columns visualization settings", () => {
  const question = {
    name: "30905",
    query: {
      "source-table": ORDERS_ID,
      expressions: {
        [EXPRESSION_NAME]: ["+", 1, 1],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.createQuestion(question).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { enable_embedding: true });

      visitQuestion(id);
    });
  });

  it("should not show 'Save' after modifying minibar settings for a custom column", () => {
    goToExpressionSidebarVisualizationSettings();
    popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });
    saveModifiedQuestion();
  });

  it("should not show 'Save' after text formatting visualization settings", () => {
    goToExpressionSidebarVisualizationSettings();

    popover().within(() => {
      const viewAsDropdown = cy.findByLabelText("Display as");
      viewAsDropdown.click();
    });

    cy.findByLabelText("Email link").click();

    popover().within(() => {
      cy.findByText("Email link").should("exist");
    });

    saveModifiedQuestion();
  });

  it("should not show 'Save' after saving viz settings from the custom column dropdown", () => {
    cy.findAllByTestId("header-cell").contains(EXPRESSION_NAME).click();
    popover().within(() => {
      cy.findByRole("button", { name: /gear icon/i }).click();
    });
    popover().within(() => {
      const miniBarSwitch = cy.findByLabelText("Show a mini bar chart");
      miniBarSwitch.click();
      miniBarSwitch.should("be.checked");
    });

    saveModifiedQuestion();
  });
});

function saveModifiedQuestion() {
  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").click();
  });
  cy.findByTestId("save-question-modal").within(() => {
    cy.findByText(/Replace original question/i).should("exist");
    cy.findByText("Save").click();
  });

  cy.findByTestId("qb-header-action-panel").within(() => {
    cy.findByText("Save").should("not.exist");
  });
}

function goToExpressionSidebarVisualizationSettings() {
  cy.findByTestId("viz-settings-button").click();
  cy.findByTestId(`${EXPRESSION_NAME}-settings-button`).click();
}

describe("issue 32625, issue 31635", () => {
  const CC_NAME = "Is Promotion";

  const QUESTION = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          "distinct",
          ["field", ORDERS.PRODUCT_ID, { "base-type": "type/Integer" }],
        ],
        breakout: ["expression", CC_NAME],
        expressions: {
          [CC_NAME]: [
            "case",
            [[[">", ["field", ORDERS.DISCOUNT, null], 0], 1]],
            { default: 0 },
          ],
        },
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove dependent clauses when a clause is removed (metabase#32625, metabase#31635)", () => {
    visitQuestionAdhoc(QUESTION, { mode: "notebook" });

    getNotebookStep("expression")
      .findAllByTestId("notebook-cell-item")
      .first()
      .icon("close")
      .click();

    getNotebookStep("expression").should("not.exist");
    getNotebookStep("summarize").findByText(CC_NAME).should("not.exist");

    visualize();

    cy.findByTestId("query-builder-main").within(() => {
      cy.findByTestId("scalar-value").should("have.text", "200");
      cy.findByText("There was a problem with your question").should(
        "not.exist",
      );
    });
  });
});

describe("issue 32964", () => {
  const LONG_NAME = "A very long column name that will cause text overflow";

  const QUESTION = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        expressions: {
          [LONG_NAME]: [
            "*",
            ["field", SAMPLE_DATABASE.ORDERS.SUBTOTAL, null],
            2,
          ],
        },
        aggregation: [["sum", ["expression", LONG_NAME]]],
        breakout: [
          [
            "field",
            SAMPLE_DATABASE.ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "week",
            },
          ],
        ],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not overflow chart settings sidebar with long column name (metabase#32964)", () => {
    visitQuestionAdhoc(QUESTION);
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(([sidebar]) => {
      const maxX = sidebar.getBoundingClientRect().right;
      cy.findByText(`Sum of ${LONG_NAME}`).then(([el]) => {
        const x = el.getBoundingClientRect().right;
        expect(x).to.be.lessThan(maxX);
      });
    });
  });
});

describe("issue 33079", () => {
  const questionDetails = {
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.request("GET", "/api/user/current").then(({ body: user }) => {
      cy.request("PUT", `/api/user/${user.id}`, { locale: "de" });
    });
  });

  it("underlying records drill should work in a non-English locale (metabase#33079)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    cartesianChartCircle().eq(1).click({ force: true });
    popover()
      .findByText(/Order/) // See these Orders
      .click();
    cy.wait("@dataset");
    cy.findByTestId("question-row-count").should("contain", "19");
  });
});

describe("issue 34414", () => {
  const { INVOICES_ID } = SAMPLE_DATABASE;

  const INVOICE_MODEL_DETAILS = {
    name: "Invoices Model",
    query: { "source-table": INVOICES_ID },
    type: "model",
  };
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("populate field values after re-adding filter on virtual table field (metabase#34414)", () => {
    cy.createQuestion(INVOICE_MODEL_DETAILS).then(response => {
      const modelId = response.body.id;

      visitQuestionAdhoc({
        dataset_query: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: { "source-table": `card__${modelId}` },
        },
      });
    });

    openNotebook();
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Plan").click();
      assertPlanFieldValues();

      cy.log("Open filter again");
      cy.findByLabelText("Back").click();

      cy.log("Open plan field again");
      cy.findByText("Plan").click();

      assertPlanFieldValues();
    });
  });
});

function assertPlanFieldValues() {
  cy.findByText("Basic").should("be.visible");
  cy.findByText("Business").should("be.visible");
  cy.findByText("Premium").should("be.visible");
}

describe("issue 38176", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  });

  it("restoring a question to a previous version should preserve the variables (metabase#38176)", () => {
    cy.createNativeQuestion(
      {
        name: "38176",
        native: {
          query:
            'SELECT "COUNTRY" from "ACCOUNTS" WHERE country = {{ country }} LIMIT 5',
          "template-tags": {
            country: {
              type: "text",
              id: "dd06cd10-596b-41d0-9d6e-94e98ceaf989",
              name: "country",
              "display-name": "Country",
            },
          },
        },
      },
      { visitQuestion: true },
    );

    cy.findByPlaceholderText("Country").type("NL");

    cy.findByTestId("query-builder-main").button("Get Answer").click();

    questionInfoButton().click();
    rightSidebar().within(() => {
      cy.findByText("History");

      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");
      cy.findByText(/added a description/i);
      cy.findByTestId("question-revert-button").click();

      cy.findByText(/reverted to an earlier version/i).should("be.visible");
    });

    cy.findAllByRole("gridcell").should("contain", "NL");
  });
});

describe("issue 38354", { tags: "@external" }, () => {
  const QUESTION_DETAILS = {
    query: {
      "source-table": ORDERS_ID,
      limit: 5,
    },
  };
  beforeEach(() => {
    restore();
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.createQuestion(QUESTION_DETAILS, { visitQuestion: true });
  });

  it("should be possible to change source database (metabase#38354)", () => {
    openNotebook();
    getNotebookStep("data").findByTestId("data-step-cell").click();
    entityPickerModal().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    // optimization: add a limit so that query runs faster
    cy.button("Row limit").click();
    getNotebookStep("limit").findByPlaceholderText("Enter a limit").type("5");

    visualize();

    cy.findByTestId("query-builder-main")
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.get("[data-testid=cell-data]").should("contain", "37.65"); // assert visualization renders the data
  });
});

describe("issue 39102", () => {
  const questionDetails = {
    name: "39102",
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        aggregation: ["count"],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 1000],
      aggregation: ["count"],
    },
    type: "question",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to preview a multi-stage query (metabase#39102)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });
    openNotebook();

    getNotebookStep("data", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Tax").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 0 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("be.visible");
      cy.icon("close").click();
    });

    getNotebookStep("filter", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("3,610").should("be.visible");
      cy.findByText("744").should("not.exist");
      cy.icon("close").click();
    });

    getNotebookStep("summarize", { stage: 1 }).icon("play").click();
    cy.wait("@dataset");
    cy.findByTestId("preview-root").within(() => {
      cy.findByText("Count").should("be.visible");
      cy.findByText("4").should("be.visible");
    });
  });
});

describe("issue 39795", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    //If you comment out this post, then the test will pass.
    cy.request("post", `/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      human_readable_field_id: PRODUCTS.TITLE,
      name: "Product ID",
      type: "external",
    });
  });

  it("should allow me to re-order even when a field is set with a different display value (metabase#39795)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
        },
        type: "query",
      },
    });
    cy.findByTestId("viz-settings-button").click();
    moveColumnDown(getDraggableElements().first(), 2);

    // We are not able to re-order because the dataset will also contain values a column for Product ID
    // This causes the isValid() check to fire, and you are always forced into the default value for table.columns
    getDraggableElements().eq(2).should("contain.text", "ID");
  });
});

describe("issue 40176", () => {
  const DIALECT = "postgres";
  const TABLE = "uuid_pk_table";
  beforeEach(() => {
    restore(`${DIALECT}-writable`);
    cy.signInAsAdmin();
    resetTestTable({ type: DIALECT, table: TABLE });
    resyncDatabase({
      dbId: WRITABLE_DB_ID,
      tableName: TABLE,
    });
  });

  it(
    "should allow filtering on UUID PK columns (metabase#40176)",
    { tags: "@external" },
    () => {
      getTable({ name: TABLE }).then(({ id: tableId }) => {
        visitQuestionAdhoc({
          display: "table",
          dataset_query: {
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
            },
            type: "query",
          },
        });
      });
      openNotebook();
      cy.findByTestId("action-buttons").findByText("Filter").click();
      popover().within(() => {
        cy.findByText("ID").click();
        cy.findByLabelText("Filter value").type(
          "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        );
        cy.button("Add filter").click();
      });
      visualize();
      cy.findByTestId("question-row-count")
        .findByText("Showing 1 row")
        .should("be.visible");
    },
  );
});

describe("issue 40435", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should make new query columns visible by default (metabase#40435)", () => {
    openOrdersTable();
    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("User ID").click();
    });
    getNotebookStep("data").button("Pick columns").click();
    visualize();
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("ID-hide-button").click();
      cy.findByTestId("ID-show-button").click();
    });
    saveQuestion();

    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Product ID").click();
    queryBuilderHeader().findByText("Save").click();
    modal().last().findByText("Save").click();
    cy.wait("@updateCard");
    visualize();

    cy.findByRole("columnheader", { name: "ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "User ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "Product ID" }).should("be.visible");
  });
});

describe(
  "issue 42010 -- Unable to filter by mongo id",
  { tags: "@mongo" },
  () => {
    beforeEach(() => {
      restore("mongo-5");
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.request(`/api/database/${WRITABLE_DB_ID}/schema/`).then(({ body }) => {
        const tableId = body.find(table => table.name === "orders").id;
        openTable({
          database: WRITABLE_DB_ID,
          table: tableId,
          limit: 2,
        });
      });
      cy.wait("@dataset");
    });

    it("should be possible to filter by Mongo _id column (metabase#40770, metabase#42010)", () => {
      cy.get("#main-data-grid")
        .findAllByRole("gridcell")
        .first()
        .then($cell => {
          // Ids are non-deterministic so we have to obtain the id from the cell, and store its value.
          const id = $cell.text();

          cy.log(
            "Scenario 1 - Make sure the simple mode filter is working correctly (metabase#40770)",
          );
          filter();

          cy.findByRole("dialog").within(() => {
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Apply filters").click();
          });

          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
          removeFilter();

          cy.log(
            "Scenario 2 - Make sure filter is working in the notebook editor (metabase#42010)",
          );
          openNotebook();
          filter({ mode: "notebook" });

          popover()
            .findAllByRole("option")
            .first()
            .should("have.text", "ID")
            .click();

          cy.findByTestId("string-filter-picker").within(() => {
            cy.findByLabelText("Filter operator").should("have.value", "Is");
            cy.findByPlaceholderText("Search by ID").type(id);
            cy.button("Add filter").click();
          });

          cy.findByTestId("step-filter-0-0").within(() => {
            cy.findByText(`ID is ${id}`);

            cy.log(
              "Scenario 2.1 - Trigger the preview to make sure it reflects the filter correctly",
            );
            cy.icon("play").click();
          });

          // The preview should show only one row
          const ordersColumns = 10;
          cy.findByTestId("preview-root")
            .get("#main-data-grid")
            .findAllByTestId("cell-data")
            .should("have.length.at.most", ordersColumns);

          cy.log("Scenario 2.2 - Make sure we can visualize the data");
          visualize();
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1 row",
          );
        });
    });
  },
);

function removeFilter() {
  cy.findByTestId("filter-pill").findByLabelText("Remove").click();
  cy.findByTestId("question-row-count").should("have.text", "Showing 2 rows");
}

describe("issue 42244", () => {
  const COLUMN_NAME = "Created At".repeat(5);

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      display_name: COLUMN_NAME,
    });
  });

  it("should allow to change the temporal bucket when the column name is long (metabase#42244)", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    getNotebookStep("summarize")
      .findByText("Pick a column to group by")
      .click();
    popover().within(() => {
      cy.findByText(COLUMN_NAME).realHover();
      cy.findByText("by month").should("be.visible").click();
    });
    popover().last().findByText("Year").click();
    getNotebookStep("summarize")
      .findByText(`${COLUMN_NAME}: Year`)
      .should("be.visible");
  });
});

describe("issue 42957", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("does not show collections that contain models from different tabs (metabase#42957)", () => {
    createQuestion({
      name: "Model",
      type: "model",
      query: {
        "source-table": ORDERS_ID,
      },
    });

    cy.createCollection({ name: "Collection without models" }).then(
      ({ body: collection }) => {
        cy.wrap(collection.id).as("collectionId");
      },
    );

    cy.get("@collectionId").then(collectionId => {
      createQuestion({
        name: "Question",
        type: "question",
        query: {
          "source-table": ORDERS_ID,
        },
        collection_id: collectionId,
      });
    });

    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Models").should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.findByText("Collection without models").should("not.exist");
    });
  });
});

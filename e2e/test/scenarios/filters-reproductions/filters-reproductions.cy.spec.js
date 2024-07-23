import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  openOrdersTable,
  restore,
  selectFilterOperator,
  popover,
  cartesianChartCircle,
  openProductsTable,
  visualize,
  filter,
  filterWidget,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  queryBuilderMain,
  startNewQuestion,
  visitQuestionAdhoc,
  assertQueryBuilderRowCount,
  queryBuilderHeader,
  modal,
  enterCustomColumnDetails,
  createQuestion,
  tableHeaderClick,
  openNotebook,
  resetTestTable,
  resyncDatabase,
} from "e2e/support/helpers";

const {
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  ORDERS,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
} = SAMPLE_DATABASE;

describe("issue 9339", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not paste non-numeric values into single-value numeric filters (metabase#9339)", () => {
    openOrdersTable();

    tableHeaderClick("Total");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    selectFilterOperator("Greater than");
    cy.findByPlaceholderText("Enter a number").type("9339,1234").blur();
    cy.findByDisplayValue("9339").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,234").should("not.exist");
    cy.button("Add filter").should("be.enabled");
  });
});

describe.skip("issue 12496", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });
  const datePickerInput = (picker, input) =>
    cy
      .findAllByTestId("specific-date-picker")
      .eq(picker)
      .find("input")
      .eq(input);
  const setup = unit => {
    cy.createQuestion(
      {
        name: `Orders by Created At: ${unit}`,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": unit }]],
          filter: [
            "between",
            ["field", ORDERS.CREATED_AT, null],
            "2022-04-01",
            "2022-05-31",
          ],
        },
        display: "line",
      },
      { visitQuestion: true },
    );
    // When a filter is added above, we have to unhide the filter pills:
    cy.findByTestId("filters-visibility-control").click();
  };
  it("should display correct day range in filter pill when drilling into a week", () => {
    setup("week");
    cartesianChartCircle().eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 24–30, 2022")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/24/2022");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
      });
    });
  });
  it("should display correct day range in filter pill when drilling into a month", () => {
    setup("month");
    cartesianChartCircle().eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 2022")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/01/2022");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
      });
    });
  });
  it("should display correct day range in filter pill when drilling into a hour", () => {
    setup("hour");
    cartesianChartCircle().eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022, 6:00–59 PM")
      .click();
    popover().within(() => {
      cy.findByTestId("between-date-picker").within(() => {
        datePickerInput(0, 0).should("have.value", "04/30/2022");
        datePickerInput(0, 1).should("have.value", "6");
        datePickerInput(0, 2).should("have.value", "00");
        datePickerInput(1, 0).should("have.value", "04/30/2022");
        datePickerInput(1, 1).should("have.value", "6");
        datePickerInput(1, 2).should("have.value", "59");
      });
    });
  });
  it("should display correct minute in filter pill when drilling into a minute", () => {
    setup("minute");
    cartesianChartCircle().eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022, 6:56 PM")
      .click();
    popover().within(() => {
      datePickerInput(0, 0).should("have.value", "04/30/2022");
      datePickerInput(0, 1).should("have.value", "6");
      datePickerInput(0, 2).should("have.value", "56");
    });
  });
  it("should display correct minute in filter pill when drilling into a day", () => {
    setup("day");
    cartesianChartCircle().eq(0).click({ force: true });
    popover().contains("See this Order").click();
    cy.findByTestId("qb-filters-panel")
      .contains("Created At is April 30, 2022")
      .click();
    popover().within(() => {
      datePickerInput(0, 0).should("have.value", "04/30/2022");
    });
  });
});

describe("issue 16621", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    tableHeaderClick("Category");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search the list").type("Gadget");
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").click();
    });
    popover().within(() => {
      cy.findByText("Gizmo").click();
      cy.button("Update filter").click();
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Category is 2 selections")
      .should("be.visible");
  });
});

describe("issue 18770", () => {
  const questionDetails = {
    name: "18770",
    query: {
      "source-query": {
        aggregation: [["count"]],
        "source-table": ORDERS_ID,
        breakout: [
          ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    createQuestion(questionDetails, { visitQuestion: true });
  });

  it("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", () => {
    openNotebook();
    // It is important to manually triger "visualize" in order to generate the `result_metadata`
    // Otherwise, we might get false negative even when this issue gets resolved.
    // In order to do that, we have to change the breakout field first or it will never generate and send POST /api/dataset request.
    cy.findAllByTestId("notebook-cell-item")
      .contains(/Products? → Title/)
      .click();
    popover().findByText("Category").click();
    cy.findAllByTestId("notebook-cell-item").contains(/Products? → Category/);

    visualize();

    cy.findAllByTestId("cell-data")
      .filter(":contains(4,784)")
      .should("have.length", 1)
      .click();
    popover().within(() => {
      cy.findByText("Filter by this value").should("be.visible");
      cy.findAllByRole("button")
        .should("have.length", 4)
        .and("contain", "<")
        .and("contain", ">")
        .and("contain", "=")
        .and("contain", "≠");
    });
  });
});

describe("issue 20551", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with includes, rather than starts with (metabase#20551)", () => {
    openProductsTable({ mode: "notebook" });
    filter({ mode: "notebook" });

    popover().within(() => {
      cy.findByText("Category").click();
      cy.findByPlaceholderText("Search the list").type("i");

      cy.findByText("Doohickey").should("be.visible");
      cy.findByText("Gizmo").should("be.visible");
      cy.findByText("Widget").should("be.visible");
      cy.findByText("Gadget").should("not.exist");
    });
  });
});

describe("issue 20683", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();

    popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative dates…").click();
      cy.findByText("Past").click();
      cy.findByText("Current").click();
      cy.findByText("Quarter").click();
    });

    visualize();

    queryBuilderMain().findByText("No results!").should("be.visible");
  });
});

describe("issue 21979", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
    openProductsTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByLabelText("Monday").click();
      cy.button("Add filter").click();
    });

    getNotebookStep("filter")
      .findByText("Created At excludes Mondays")
      .should("be.visible");

    visualize();

    // Make sure the query is correct
    // (a product called "Enormous Marble Wallet" is created on Monday)
    queryBuilderMain().findByText("Enormous Marble Wallet").should("not.exist");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At excludes Mondays")
      .click();

    popover().within(() => {
      cy.findByLabelText("Monday").click();
      cy.findByLabelText("Thursday").click();
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");

    queryBuilderMain()
      .findByText("Enormous Marble Wallet")
      .should("be.visible");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At excludes Thursdays")
      .should("be.visible");
  });
});

describe("issue 22230", () => {
  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["max", ["field", PEOPLE.NAME, null]]],
        breakout: [["field", PEOPLE.SOURCE, null]],
      },
      type: "query",
      display: "table",
    },
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to filter on an aggregation (metabase#22230)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Max of Name").click();
      cy.findByDisplayValue("Is").click();
    });
    cy.findByRole("listbox").findByText("Starts with").click();

    popover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Zo").blur();
      cy.button("Add filter").click();
    });

    visualize();

    assertQueryBuilderRowCount(2);
    queryBuilderMain(() => {
      cy.findByText("Zora Schamberger").should("be.visible");
      cy.findByText("Zoie Kozey").should("be.visible");
    });
  });
});

describe("issue 22730", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(
      {
        name: "22730",
        native: {
          query:
            "select '14:02:13'::time \"time\", 'before-row' \"name\" union all select '14:06:13'::time \"time\", 'after-row' ",
        },
      },
      { visitQuestion: true },
    );

    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows filtering by time column (metabase#22730)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").click();
    cy.wait("@dataset");

    tableHeaderClick("time");

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByDisplayValue("00:00").clear().type("14:03");
      cy.button("Add filter").click();
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("before-row");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("after-row").should("not.exist");
  });
});

describe("issue 24664", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    tableHeaderClick("Category");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    tableHeaderClick("Category");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.findByTestId("qb-filters-panel").findByText("Category is Gizmo").click();
    popover().within(() => {
      cy.findByText("Widget").click();
      cy.button("Update filter").click();
    });

    // First filter is still there
    cy.findByTestId("qb-filters-panel").findByText("Category is Doohickey");
  });
});

describe("issue 24994", () => {
  const questionDetails = {
    query: {
      "source-query": {
        "source-table": PRODUCTS_ID,
        filter: [
          "and",
          ["=", ["field", PRODUCTS.CATEGORY, null], "Gadget", "Gizmo"],
          [
            "time-interval",
            ["field", PRODUCTS.CREATED_AT, null],
            -30,
            "year",
            {
              include_current: false,
            },
          ],
        ],
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      filter: [
        ">",
        [
          "field",
          "count",
          {
            "base-type": "type/Integer",
          },
        ],
        0,
      ],
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should allow updating filters (metabase#24994)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    // Three filters
    cy.findByTestId("filters-visibility-control").contains("3").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 2 selections").click();
    assertFilterValueIsSelected("Gadget");
    assertFilterValueIsSelected("Gizmo");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").click();
    assertFilterValueIsSelected("Doohickey");
    cy.button("Update filter").should("not.be.disabled").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 3 selections");
  });
});

function assertFilterValueIsSelected(value) {
  cy.findByRole("checkbox", { name: value }).should("be.checked");
}

describe("issue 25378", () => {
  const questionDetails = {
    name: "25378",
    dataset_query: {
      type: "query",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      database: SAMPLE_DB_ID,
    },
    display: "line",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to use relative date filter on a breakout after the aggregation (metabase#25378)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Relative dates…").click();
      cy.findByDisplayValue("days").click();
    });
    cy.findByRole("listbox").findByText("months").click();

    popover().findByLabelText("Options").click();
    popover().last().findByText("Starting from…").click();
    popover().button("Add filter").click();

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});

describe("issue 25927", () => {
  const query = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        expressions: {
          "Custom Count": ["field", "count", { "base-type": "type/Integer" }],
        },
      },
      type: "query",
    },
    display: "table",
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(query);
  });

  it("column filter should work for questions with custom column (metabase#25927)", () => {
    tableHeaderClick("Created At: Month");
    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Last 30 days").click();
    });

    cy.wait("@dataset");

    // Click on the filter again to try updating it
    cy.findByTestId("qb-filters-panel")
      .contains("Created At: Month is in the previous 30 days")
      .click();

    popover().button("Update filter").should("not.be.disabled");
  });
});

describe("issue 25990", () => {
  const questionDetails = {
    dataset_query: {
      type: "query",
      database: SAMPLE_DB_ID,
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          joins: [
            {
              fields: "all",
              "source-table": PEOPLE_ID,
              condition: [
                "=",
                ["field", ORDERS.USER_ID, null],
                ["field", PEOPLE.ID, { "join-alias": "People - User" }],
              ],
              alias: "People - User",
            },
          ],
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
      },
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to filter by a column in a joined table (metabase#25990)", () => {
    visitQuestionAdhoc(questionDetails);

    queryBuilderHeader().button("Filter").click();

    modal().within(() => {
      cy.findByText("Person").click();
      cy.findByPlaceholderText("Enter an ID").type("10").blur();
      cy.button("Apply filters").click();
    });

    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel")
      .findByText("People - User → ID is 10")
      .should("be.visible");
  });
});

describe("issue 25994", () => {
  const questionDetails = {
    dataset_query: {
      type: "query",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [
          ["min", ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "day" }]],
        ],
        breakout: [["field", PRODUCTS.CATEGORY, null]],
      },
      database: SAMPLE_DB_ID,
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be possible to use 'between' dates filter after aggregation (metabase#25994)", () => {
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    popover().within(() => {
      cy.findByText("Min of Created At: Day").click();
      cy.findByText("Specific dates…").click();

      // It doesn't really matter which dates we select so let's go with whatever is offered
      cy.button("Add filter").click();
    });

    visualize(response => {
      expect(response.body.error).to.not.exist;
    });
  });
});

describe.skip("issue 26861", () => {
  const filter = {
    id: "a3b95feb-b6d2-33b6-660b-bb656f59b1d7",
    name: "filter",
    "display-name": "Filter",
    type: "dimension",
    dimension: ["field", ORDERS.CREATED_AT, null],
    "widget-type": "date/all-options",
    default: null,
  };

  const nativeQuery = {
    name: "26861",
    native: {
      query: "select * from orders where {{filter}} limit 2",
      "template-tags": {
        filter,
      },
    },
  };
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    restore();
    cy.signInAsAdmin();

    cy.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("exclude filter shouldn't break native questions with field filters (metabase#26861)", () => {
    filterWidget().click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude...").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Days of the week...").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tuesday").click();

    cy.button("Update filter").click();
    // In all other places in application, POST /api/dataset fires immediately after "Update filter"
    // A part of this bug is that we have to manually run the query so the next step will fail
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("CREATED_AT excludes Tuesday");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("117.03").should("not.exist");
  });
});

describe("issue 27123", () => {
  const questionDetails = {
    query: {
      "source-table": ORDERS_ID,
      limit: 100,
    },
  };
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("exclude filter should not resolve to 'Days of the week' regardless of the chosen granularity  (metabase#27123)", () => {
    tableHeaderClick("Created At");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude…").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Months of the year…").click();

    popover()
      .should("contain", "Months of the year…")
      .and("contain", "January");
  });
});

describe("issue 29094", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("disallows adding a filter using non-boolean custom expression (metabase#29094)", () => {
    startNewQuestion();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();

    popover().within(() => {
      cy.findByText("Custom Expression").click();
      enterCustomColumnDetails({ formula: "[Tax] * 22" });
      cy.realPress("Tab");
      cy.button("Done").should("be.disabled");
      cy.findByText("Invalid expression").should("exist");
    });
  });
});

describe("issue 30312", () => {
  const CREATED_AT_BREAKOUT = [
    "field",
    ORDERS.CREATED_AT,
    {
      "base-type": "type/DateTime",
      "temporal-unit": "month",
    },
  ];
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("can use a drill filter on an aggregated column (metabase#30312)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [CREATED_AT_BREAKOUT],
          limit: 5, // optimization
        },
        display: "table",
      },
      { visitQuestion: true },
    );

    cy.findAllByTestId("header-cell").eq(1).should("have.text", "Count");

    tableHeaderClick("Count");

    popover().findByText("Filter by this column").click();
    selectFilterOperator("Equal to");
    popover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("10");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });

    cy.findByTestId("filter-pill").should("have.text", "Count is equal to 10");
    queryBuilderMain().findByText("No results!").should("be.visible");
  });
});

describe("issue 31340", () => {
  const LONG_COLUMN_NAME =
    "Some very very very very long column name that should have a line break";

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("GET", "/api/field/*/search/*").as("search");

    cy.visit(
      `/admin/datamodel/database/${SAMPLE_DB_ID}/schema/${SAMPLE_DB_SCHEMA_ID}/table/${PEOPLE_ID}`,
    );

    cy.findByTestId("column-PASSWORD")
      .findByDisplayValue("Password")
      .type(`{selectAll}${LONG_COLUMN_NAME}`)
      .blur();

    cy.wait("@fieldUpdate");

    cy.createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          limit: 2,
        },
      },
      { visitQuestion: true },
    );
  });

  it("should properly display long column names in filter options search results (metabase#31340)", () => {
    tableHeaderClick(LONG_COLUMN_NAME);

    popover().findByText("Filter by this column").click();
    selectFilterOperator("Is");
    popover().within(() => {
      cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
        "nonexistingvalue",
      );
      cy.wait("@search");
    });
  });
});

describe("issue 34794", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when navigating to filter popover's custom expression section (metabase#34794)", () => {
    openOrdersTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Created At").click();
      cy.icon("chevronleft").click(); // go back to the main filter popover
      cy.findByText("Custom Expression").click();
      cy.findByLabelText("Expression").type("[Total] > 10").blur();
      cy.button("Done").click();
    });

    getNotebookStep("filter")
      .findByText("Total is greater than 10")
      .should("be.visible");
  });
});

describe("issue 36508", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should treat 'Number of distinct values' aggregation as numerical (metabase#36508)", () => {
    createQuestion(
      {
        query: {
          "source-table": PEOPLE_ID,
          aggregation: [
            ["distinct", ["field", PEOPLE.EMAIL, { "base-type": "type/Text" }]],
          ],
          breakout: [["field", PEOPLE.SOURCE, { "base-type": "type/Text" }]],
          limit: 5,
        },
      },
      { visitQuestion: true },
    );

    cy.button("Filter").click();

    modal().within(() => {
      cy.findByText("Summaries").click();

      cy.findByTestId("filter-column-Distinct values of Email")
        .findByText("between")
        .should("exist")
        .click();
    });

    popover().within(() => {
      cy.findByText("Equal to").should("exist");
      cy.findByText("Greater than").should("exist");
      cy.findByText("Less than").should("exist");
    });
  });
});

describe("metabase#32985", () => {
  const questionDetails = {
    database: SAMPLE_DB_ID,
    query: {
      "source-table": PEOPLE_ID,
    },
    type: "query",
  };

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not crash when searching large field values sets in filters popover (metabase#32985)", () => {
    // we need to mess with the field metadata to make the field values crazy
    cy.request("PUT", `/api/field/${REVIEWS.REVIEWER}`, {
      semantic_type: "type/PK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      semantic_type: "type/FK",
    });
    cy.request("PUT", `/api/field/${PEOPLE.EMAIL}`, {
      fk_target_field_id: REVIEWS.REVIEWER,
    });

    cy.createQuestion(questionDetails, { visitQuestion: true });

    tableHeaderClick("Email");

    popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Email").type("foo");
    });
  });
});

describe.skip("metabase#44550", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display the filter with an offset appropriately in the time-series chrome and in the filter modal (metabase#44550)", () => {
    const questionDetails = {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
        ],
        filter: [
          "between",
          [
            "+",
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "base-type": "type/DateTime",
              },
            ],
            ["interval", 7, "day"],
          ],
          ["relative-datetime", -30, "day"],
          ["relative-datetime", 0, "day"],
        ],
      },
      type: "query",
    };

    createQuestion(questionDetails, { visitQuestion: true });
    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At is in the previous 30 days, starting 7 days ago",
    );

    cy.log("Repro for the time-series chrome");
    cy.findByTestId("timeseries-filter-button")
      .should("not.have.text", "All time")
      .and("contain", /previous 30 days/i)
      .and("contain", /7 days ago/i);

    cy.log("Repro for the filter modal");
    filter();
    // Not entirely sure how the DOM looks like in this scenario.
    // TODO: Update the test if needed.
    cy.findByTestId("filter-column-Created At")
      .should("contain", /previous 30 days/i)
      .and("contain", /7 days ago/i);
  });
});

describe("issue 35043", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should prevent illogical ranges - from newer to older (metabase#35043)", () => {
    const questionDetails = {
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        filter: [
          "between",
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
            },
          ],
          "2024-04-15",
          "2024-05-22",
        ],
        limit: 5,
      },
      type: "query",
    };

    createQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill")
      .should("have.text", "Created At is Apr 15 – May 22, 2024")
      .click();

    cy.findByTestId("datetime-filter-picker").within(() => {
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByDisplayValue("May 22, 2024").type("{backspace}2").blur();
      cy.findByDisplayValue("May 22, 2022").should("exist");

      cy.button("Update filter").click();
      cy.wait("@dataset");
    });

    cy.findByTestId("filter-pill").should(
      "have.text",
      "Created At is May 22, 2022 – Apr 15, 2024",
    );
  });
});

describe("issue 40622", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should display the Filter modal correctly with long column names (metabase#40622)", () => {
    const LONG_COLUMN_NAME =
      "Reviews, but with a very very veeeeeery long name!";
    cy.request("PUT", `/api/table/${REVIEWS_ID}`, {
      display_name: LONG_COLUMN_NAME,
    });

    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          joins: [
            {
              fields: "all",
              strategy: "left-join",
              alias: "Orders - Product",
              condition: [
                "=",
                ["field", REVIEWS.PRODUCT_ID, { "base-type": "type/Integer" }],
                [
                  "field",
                  ORDERS.PRODUCT_ID,
                  {
                    "base-type": "type/Integer",
                    "join-alias": "Orders - Product",
                  },
                ],
              ],
              "source-table": ORDERS_ID,
            },
          ],
        },
        parameters: [],
      },
    });

    filter();
    assertTablesAreEquallyLeftRightPositioned();

    cy.log("Resize and make sure the filter sidebar is intact");
    cy.viewport(800, 300);
    assertTablesAreEquallyLeftRightPositioned();

    cy.log("Make sure sidebar is scrollable");
    filterSidebar().within(() => {
      cy.findByRole("tab", { name: LONG_COLUMN_NAME }).should("be.visible");
      cy.findByRole("tab", { name: "User" }).should("not.be.visible");
    });

    filterSidebar().scrollTo("bottom");
    filterSidebar().within(() => {
      cy.findByRole("tab", { name: LONG_COLUMN_NAME }).should("not.be.visible");
      cy.findByRole("tab", { name: "User" }).should("be.visible");
    });
  });

  function filterSidebar() {
    return cy.findByRole("tablist");
  }

  function assertTablesAreEquallyLeftRightPositioned() {
    filterSidebar().within(() => {
      cy.findAllByRole("tab").each((_el, index, $list) => {
        if (index === $list.length - 1) {
          return;
        }

        const currentTab = $list[index].getBoundingClientRect();
        const nextTab = $list[index + 1].getBoundingClientRect();
        expect(currentTab.left).to.eq(nextTab.left);
        expect(currentTab.right).to.eq(nextTab.right);
      });
    });
  }
});

describe("45252", { tags: "@external" }, () => {
  beforeEach(() => {
    resetTestTable({ type: "postgres", table: "many_data_types" });
    restore("postgres-writable");
    cy.signInAsAdmin();
    resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow using is-null and not-null operators with unsupported data types (metabase#45252,metabase#38111)", () => {
    startNewQuestion();

    cy.log("filter picker - new filter");
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Writable Postgres12").click();
      cy.findByText("Many Data Types").click();
    });
    getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    popover().within(() => {
      cy.findByText("Binary").scrollIntoView().click();
      cy.findByLabelText("Is empty").click();
      cy.button("Add filter").click();
    });
    visualize();
    cy.wait("@dataset");
    assertQueryBuilderRowCount(0);

    cy.log("filter picker - existing filter");
    cy.findByTestId("qb-filters-panel").findByText("Binary is empty").click();
    popover().within(() => {
      cy.findByLabelText("Not empty").click();
      cy.button("Update filter").click();
      cy.wait("@dataset");
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Binary is not empty")
      .should("be.visible");
    assertQueryBuilderRowCount(2);

    cy.log("filter modal - existing filter");
    queryBuilderHeader().button("Filter").click();
    modal().within(() => {
      cy.findByTestId("filter-column-Binary")
        .findByLabelText("Is empty")
        .click();
      cy.button("Apply filters").click();
      cy.wait("@dataset");
    });
    cy.wait("@dataset");
    assertQueryBuilderRowCount(0);

    cy.log("filter modal - json column");
    queryBuilderHeader().button("Filter").click();
    modal().within(() => {
      cy.findByTestId("filter-column-Binary")
        .findByLabelText("Not empty")
        .click();
      cy.findByTestId("filter-column-Jsonb")
        .findByLabelText("Not empty")
        .click();
      cy.button("Apply filters").click();
      cy.wait("@dataset");
    });
    cy.wait("@dataset");
    assertQueryBuilderRowCount(2);
  });
});

describe.skip("issue 44435", () => {
  // It is crucial that the string is without spaces!
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const longString = alphabet.repeat(10);

  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("filter pill should not overflow the window width when the filter string is very long (metabase#44435)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          fields: [
            ["field", REVIEWS.REVIEWER, { "base-type": "type/Text" }],
            ["field", REVIEWS.RATING, { "base-type": "type/Integer" }],
          ],
          filter: [
            "=",
            ["field", REVIEWS.BODY, { "base-type": "type/Text" }],
            longString,
          ],
        },
        parameters: [],
      },
    });

    cy.findByTestId("filter-pill").then($pill => {
      const pillWidth = $pill[0].getBoundingClientRect().width;
      cy.window().its("innerWidth").should("be.gt", pillWidth);
    });
  });
});

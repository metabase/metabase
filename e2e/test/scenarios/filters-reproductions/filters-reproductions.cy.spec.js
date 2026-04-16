const { H } = cy;

import {
  SAMPLE_DB_ID,
  SAMPLE_DB_SCHEMA_ID,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const {
  ORDERS_ID,
  PRODUCTS,
  PRODUCTS_ID,
  ORDERS,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE,
  PEOPLE_ID,
  INVOICES,
} = SAMPLE_DATABASE;

describe("issue 9339", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not paste non-numeric values into single-value numeric filters (metabase#9339)", () => {
    H.openOrdersTable();

    H.tableHeaderClick("Total");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    H.selectFilterOperator("Greater than");
    cy.findByPlaceholderText("Enter a number").type("9339,1234").blur();
    cy.findByDisplayValue("9339").should("be.visible");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("1,234").should("not.exist");
    cy.button("Add filter").should("be.enabled");
  });
});

describe("issue 16621", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#16621)", () => {
    H.tableHeaderClick("Category");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search the list").type("Gadget");
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Category is Gadget").click();
    });
    H.popover().within(() => {
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
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("post-aggregation filter shouldn't affect the drill-through options (metabase#18770)", () => {
    H.openNotebook();
    // It is important to manually trigger "visualize" in order to generate the `result_metadata`
    // Otherwise, we might get false negative even when this issue gets resolved.
    // In order to do that, we have to change the breakout field first or it will never generate and send POST /api/dataset request.
    cy.findAllByTestId("notebook-cell-item")
      .contains(/Products? → Title/)
      .click();
    H.popover().findByText("Category").click();
    cy.findAllByTestId("notebook-cell-item").contains(/Products? → Category/);

    H.visualize();

    cy.findAllByTestId("cell-data")
      .filter(":contains(4,784)")
      .should("have.length", 1);

    // Querying the cell again to ensure the dom node stability
    H.tableInteractiveBody().findByText("4,784").click();
    H.popover().within(() => {
      cy.findByText("Filter by this value").should("be.visible");
      cy.findAllByRole("button")
        .should("have.length", 6)
        .and("contain", "See these Orders")
        .and("contain", "Break out by")
        .and("contain", "<")
        .and("contain", ">")
        .and("contain", "=")
        .and("contain", "≠");
    });
  });
});

describe("issue 20551", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow filtering with includes, rather than starts with (metabase#20551)", () => {
    H.openProductsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    H.popover().within(() => {
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
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should filter postgres with the 'current quarter' filter (metabase#20683)", () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("filter")
      .findByText(/Add filter/)
      .click();

    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Relative date range…").click();
      cy.findByText("Previous").click();
      cy.findByText("Current").click();
      cy.findByText("Quarter").click();
    });

    H.visualize();

    H.queryBuilderMain().findByText("No results!").should("be.visible");
  });
});

describe("issue 21979", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
    H.openProductsTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByLabelText("Monday").click();
      cy.button("Add filter").click();
    });

    H.getNotebookStep("filter")
      .findByText("Created At excludes Mondays")
      .should("be.visible");

    H.visualize();

    // Make sure the query is correct
    // (a product called "Enormous Marble Wallet" is created on Monday)
    H.queryBuilderMain()
      .findByText("Enormous Marble Wallet")
      .should("not.exist");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At excludes Mondays")
      .click();

    H.popover().within(() => {
      cy.findByLabelText("Monday").click();
      cy.findByLabelText("Thursday").click();
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");

    H.queryBuilderMain()
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
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to filter on an aggregation (metabase#22230)", () => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    H.clauseStepPopover().within(() => {
      cy.findByText("Max of Name").click();
      cy.findByText("Contains").click();
    });
    cy.findByRole("menu").findByText("Starts with").click();

    H.clauseStepPopover().within(() => {
      cy.findByPlaceholderText("Enter some text").type("Zo").blur();
      cy.button("Add filter").click();
    });

    H.visualize();

    H.assertQueryBuilderRowCount(2);
    H.queryBuilderMain(() => {
      cy.findByText("Zora Schamberger").should("be.visible");
      cy.findByText("Zoie Kozey").should("be.visible");
    });
  });
});

describe("issue 22730", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(
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
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").click();
    cy.wait("@dataset");

    H.tableHeaderClick("time");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByDisplayValue("00:00").clear().type("14:03");
      cy.button("Add filter").click();
    });

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("before-row");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("after-row").should("not.exist");
  });
});

describe("issue 24664", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openProductsTable({ limit: 3 });
  });

  it("should be possible to create multiple filter that start with the same value (metabase#24664)", () => {
    H.tableHeaderClick("Category");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Doohickey").click();
      cy.button("Add filter").click();
    });

    H.tableHeaderClick("Category");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Gizmo").click();
      cy.button("Add filter").click();
    });

    cy.findByTestId("qb-filters-panel").findByText("Category is Gizmo").click();
    H.popover().within(() => {
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
    H.restore();
    cy.signInAsAdmin();
  });

  it("should allow updating filters (metabase#24994)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });

    // Three filters
    cy.findByTestId("filters-visibility-control").contains("3").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 2 selections").click();
    assertFilterValueIsSelected("Gadget");
    assertFilterValueIsSelected("Gizmo");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Doohickey").click();
    assertFilterValueIsSelected("Doohickey");
    cy.button("Update filter").should("not.be.disabled").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Category is 3 selections");
  });
});

function assertFilterValueIsSelected(value) {
  cy.findByRole("checkbox", { name: value }).should("be.checked");
}

describe("issue 45410", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not overflow the last filter value with the info icon (metabase#45410)", () => {
    H.openPeopleTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.clauseStepPopover().within(() => {
      cy.findByText("Email").click();
      cy.findByPlaceholderText("Search by Email")
        .type("abc@example.com,abc2@example.com")
        .blur();
      cy.findByText("abc2@example.com")
        .next("button")
        .then(([removeButton]) => {
          cy.icon("info").then(([infoIcon]) => {
            const removeButtonRect = removeButton.getBoundingClientRect();
            const infoIconRect = infoIcon.getBoundingClientRect();
            expect(removeButtonRect.right).to.be.lte(infoIconRect.left);
          });
        });
    });
  });
});

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
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be able to use relative date filter on a breakout after the aggregation (metabase#25378)", () => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    H.clauseStepPopover().within(() => {
      cy.findByText("Created At: Month").click();
      cy.findByText("Relative date range…").click();
      cy.findByDisplayValue("days").click();
    });
    cy.findByRole("listbox").findByText("months").click();

    H.clauseStepPopover().within(() => {
      cy.findByLabelText("Starting from…").click();
      cy.button("Add filter").click();
    });

    H.visualize((response) => {
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
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(query);
  });

  it("column filter should work for questions with custom column (metabase#25927)", () => {
    H.tableHeaderClick("Created At: Month");
    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Previous 30 days").click();
    });

    cy.wait("@dataset");

    // Click on the filter again to try updating it
    cy.findByTestId("qb-filters-panel")
      .contains("Created At: Month is in the previous 30 days")
      .click();

    H.popover().button("Update filter").should("not.be.disabled");
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
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow to filter by a column in a joined table (metabase#25990)", () => {
    H.visitQuestionAdhoc(questionDetails);

    H.queryBuilderHeader()
      .button(/Filter/)
      .click();

    H.popover().within(() => {
      cy.findByText("People").click();
      cy.findByText("ID").click();
      cy.findByPlaceholderText("Enter an ID").type("10").blur();
      cy.button("Apply filter").click();
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
    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc(questionDetails, { mode: "notebook" });
  });

  it("should be possible to use 'between' dates filter after aggregation (metabase#25994)", () => {
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    H.popover().within(() => {
      cy.findByText("Min of Created At: Day").click();
      cy.findByText("Fixed date range…").click();

      // It doesn't really matter which dates we select so let's go with whatever is offered
      cy.button("Add filter").click();
    });

    H.visualize((response) => {
      expect(response.body.error).to.not.exist;
    });
  });
});

describe("issue 26861", { tags: "@skip" }, () => {
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

    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(nativeQuery, { visitQuestion: true });
  });

  it("exclude filter shouldn't break native questions with field filters (metabase#26861)", () => {
    H.filterWidget().click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude…").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Days of the week…").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Tuesday").click();

    cy.button("Update filter").click();
    // In all other places in application, POST /api/dataset fires immediately after "Update filter"
    // A part of this bug is that we have to manually run the query so the next step will fail
    cy.wait("@dataset");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("CREATED_AT excludes Tuesday");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
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
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("exclude filter should not resolve to 'Days of the week' regardless of the chosen granularity  (metabase#27123)", () => {
    H.tableHeaderClick("Created At");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter by this column").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Exclude…").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Months of the year…").click();

    H.popover()
      .should("contain", "Months of the year…")
      .and("contain", "January");
  });
});

describe("issue 29094", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("disallows adding a filter using non-boolean custom expression (metabase#29094)", () => {
    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Sample Database").click();
      cy.findByText("Orders").click();
    });

    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();

    H.popover().within(() => {
      cy.findByText("Custom Expression").click();
      H.enterCustomColumnDetails({ formula: "[Tax] * 22" });
      cy.realPress("Tab");
      cy.button("Done").should("be.disabled");
      cy.findByText("Types are incompatible.").should("exist");
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
    H.restore();
    cy.signInAsNormalUser();
  });

  it("can use a drill filter on an aggregated column (metabase#30312)", () => {
    H.createQuestion(
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

    H.tableHeaderClick("Count");

    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Equal to");
    H.clickActionsPopover().within(() => {
      cy.findByPlaceholderText("Enter a number").type("10");
      cy.realPress("Tab");
      cy.button("Add filter").should("be.enabled").click();
    });

    cy.findByTestId("filter-pill").should("have.text", "Count is equal to 10");
    H.queryBuilderMain().findByText("No results!").should("be.visible");
  });
});

describe("issue 31340", () => {
  const LONG_COLUMN_NAME =
    "Some very very very very long column name that should have a line break";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
    cy.intercept("GET", "/api/field/*/search/*").as("search");

    H.DataModel.visit({
      databaseId: SAMPLE_DB_ID,
      schemaId: SAMPLE_DB_SCHEMA_ID,
      tableId: PEOPLE_ID,
      fieldId: PEOPLE.PASSWORD,
    });

    H.DataModel.FieldSection.getNameInput()
      .focus()
      .clear()
      .type(LONG_COLUMN_NAME)
      .blur();
    cy.wait("@fieldUpdate");

    H.createQuestion(
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
    H.tableHeaderClick(LONG_COLUMN_NAME);

    H.popover().findByText("Filter by this column").click();
    H.selectFilterOperator("Is");
    H.popover().within(() => {
      cy.findByPlaceholderText(`Search by ${LONG_COLUMN_NAME}`).type(
        "nonexistingvalue",
      );
      cy.wait("@search");
    });
  });
});

describe("issue 34794", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not crash when navigating to filter popover's custom expression section (metabase#34794)", () => {
    H.openOrdersTable({ mode: "notebook" });

    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Created At").click();
      cy.icon("chevronleft").click(); // go back to the main filter popover
      cy.findByText("Custom Expression").click();
      H.CustomExpressionEditor.type("[Total] > 10").format();
      cy.button("Done").click();
    });

    H.getNotebookStep("filter")
      .findByText("Total is greater than 10")
      .should("be.visible");
  });
});

describe("issue 36508", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should treat 'Number of distinct values' aggregation as numerical (metabase#36508)", () => {
    H.createQuestion(
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

    cy.findByTestId("qb-header")
      .button(/Filter/)
      .click();

    H.popover().within(() => {
      cy.findByText("Summaries").click();
      cy.findByText("Distinct values of Email").click();
      cy.findByText("Between").click();
    });

    H.popover()
      .eq(1)
      .within(() => {
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
    H.restore();
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

    H.createQuestion(questionDetails, { visitQuestion: true });

    H.tableHeaderClick("Email");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Email or enter an ID").type("foo");
    });
    H.popover()
      .should("have.length", 2)
      .last()
      .findByText("No matching Email found.")
      .should("be.visible");
  });
});

describe("issue 35043", () => {
  beforeEach(() => {
    H.restore();
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

    H.createQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("filters-visibility-control").click();
    cy.findByTestId("filter-pill")
      .should("have.text", "Created At is Apr 15 – May 22, 2024")
      .click();

    cy.findByTestId("date-filter-picker").within(() => {
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

describe("issue 45252", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_data_types" });
    cy.signInAsAdmin();
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "many_data_types" });
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should allow using is-null and not-null operators with unsupported data types (metabase#45252,metabase#38111)", () => {
    H.startNewQuestion();

    cy.log("filter picker - new filter");
    H.miniPicker().within(() => {
      cy.findByText("Writable Postgres12").click();
      cy.findByText("Many Data Types").click();
    });
    H.getNotebookStep("filter")
      .findByText("Add filters to narrow your answer")
      .click();
    H.popover().within(() => {
      cy.findByText("Binary").scrollIntoView().click();
      cy.findByLabelText("Is empty").click();
      cy.button("Add filter").click();
    });
    H.visualize();
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(0);

    cy.log("filter picker - existing filter");
    cy.findByTestId("qb-filters-panel").findByText("Binary is empty").click();
    H.popover().within(() => {
      cy.findByLabelText("Not empty").click();
      cy.button("Update filter").click();
      cy.wait("@dataset");
    });
    cy.findByTestId("qb-filters-panel")
      .findByText("Binary is not empty")
      .should("be.visible");
    H.assertQueryBuilderRowCount(2);

    cy.log("filter picker - existing filter");
    H.queryBuilderHeader()
      .button(/Filter/)
      .click();
    H.popover().within(() => {
      cy.findByText("Binary").click();
      cy.findByLabelText("Is empty").click();
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(0);

    cy.log("filter picker - json column");
    H.queryBuilderFiltersPanel()
      .findByText("Binary is empty")
      .icon("close")
      .click();
    cy.wait("@dataset");
    H.queryBuilderHeader()
      .button(/Filter/)
      .click();
    H.popover().within(() => {
      cy.findByText("Jsonb").click();
      cy.findByLabelText("Not empty").click();
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");
    H.assertQueryBuilderRowCount(2);
  });
});

describe("issue 44435", () => {
  // It is crucial that the string is without spaces!
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const longString = alphabet.repeat(10);

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("filter pill should not overflow the window width when the filter string is very long (metabase#44435)", () => {
    H.visitQuestionAdhoc({
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

    cy.findByTestId("filter-pill").then(($pill) => {
      const pillWidth = $pill[0].getBoundingClientRect().width;
      cy.window().its("innerWidth").should("be.gt", pillWidth);
    });
  });
});

// This reproduction can possibly be replaced with the unit test for the `ListField` component in the future
describe("issue 45877", () => {
  beforeEach(() => {
    H.restore("setup");
    cy.signInAsAdmin();
  });

  it("should not render selected boolean option twice in a filter dropdown (metabase#45877)", () => {
    const questionDetails = {
      name: "45877",
      native: {
        query: "SELECT * FROM INVOICES [[ where {{ expected_invoice }} ]]",
        "template-tags": {
          expected_invoice: {
            id: "3cfb3686-0d13-48db-ab5b-100481a3a830",
            dimension: ["field", INVOICES.EXPECTED_INVOICE, null],
            name: "expected_invoice",
            "display-name": "Expected Invoice",
            type: "dimension",
            "widget-type": "string/=",
          },
        },
      },
    };

    H.createNativeQuestion(questionDetails, { visitQuestion: true });
    H.filterWidget().should("contain", "Expected Invoice").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Search the list").should("exist");

      cy.findAllByLabelText("true")
        .should("have.length", 1)
        .and("not.be.checked");
      cy.findAllByLabelText("false")
        .should("have.length", 1)
        .and("not.be.checked")
        .click();

      cy.button("Add filter").click();
    });

    // We don't even have to run the query to reproduce this issue
    // so let's not waste time and resources doing so.
    cy.get(H.POPOVER_ELEMENT).should("not.exist");
    H.filterWidget().should("contain", "false").click();
    H.popover().within(() => {
      cy.findAllByLabelText("true").should("have.length", 1);
      cy.findAllByLabelText("false")
        .should("have.length", 1)
        .should("be.checked");
    });
  });
});

describe("issue 47887", () => {
  beforeEach(() => {
    H.restore("setup");
    cy.signInAsAdmin();
  });

  it("Case expression with type/Date default value and type/DateTime case value has Date filter popover enabled (metabase#47887)", () => {
    H.visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": PEOPLE_ID,
          expressions: {
            asdfdsa: [
              "case",
              [
                [
                  [
                    "=",
                    [
                      "field",
                      SAMPLE_DATABASE.PEOPLE.NAME,
                      { "base-type": "type/Text" },
                    ],
                    "Won",
                  ],
                  [
                    "datetime-add",
                    [
                      "field",
                      SAMPLE_DATABASE.PEOPLE.CREATED_AT,
                      { "base-type": "type/DateTimeWithLocalTZ" },
                    ],
                    0,
                    "month",
                  ],
                ],
              ],
              {
                default: [
                  "datetime-add",
                  [
                    "field",
                    SAMPLE_DATABASE.PEOPLE.BIRTH_DATE,
                    { "base-type": "type/Date" },
                  ],
                  0,
                  "month",
                ],
              },
            ],
          },
        },
        parameters: [],
      },
    });

    cy.findByTestId("notebook-button").click();
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    cy.findAllByTestId("action-buttons").last().findByText("Filter").click();

    H.popover().within(() => {
      cy.findByLabelText("asdfdsa").click();
      cy.findByText("Fixed date range…").click();
    });
  });
});

describe("Issue 48851", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(1050, 500);
  });

  const manyValues = Array(20)
    .fill(0)
    .map(() => Math.round(Math.random() * 1000_000_000_000).toString(36))
    .join(", ");

  it("should not overflow the filter popover, even when there are a lot of values (metabase#48851)", () => {
    H.openProductsTable();
    H.tableHeaderClick("Title");

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByText("Is").click();
    });

    H.popover().eq(1).findByText("Contains").click();
    H.popover().should("have.length", 1);
    H.popover()
      .findByPlaceholderText("Enter some text")
      .type(manyValues, { force: true, timeout: 0 });

    H.popover().button("Add filter").should("be.visible");
  });
});

describe("issue 49321", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not require multiple clicks to apply a filter (metabase#49321)", () => {
    H.openProductsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Title").click();
      cy.findByText("Is").click();
    });
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.popover().last().findByText("Contains").click();

    H.popover().then(($popover) => {
      const { width } = $popover[0].getBoundingClientRect();
      cy.wrap(width).as("initialWidth");
    });

    H.popover()
      .findByPlaceholderText("Enter some text")
      .type("aaaaaaaaaa, bbbbbbbbbbb,");

    cy.get("@initialWidth").then((initialWidth) => {
      H.popover().should(($popover) => {
        const { width } = $popover[0].getBoundingClientRect();
        expect(width).to.eq(initialWidth);
      });
    });
  });
});

describe("issue 49642", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  const QUESTION = {
    name: "Issue 49642",
    query: {
      "source-table": PEOPLE_ID, // people has >1000 rows
    },
  };

  it("should allow searching for more values when the filter contains more than 1000 values (metabase#49642)", () => {
    H.createDashboard().then(({ body: dashboard }) => {
      H.visitDashboard(dashboard.id);
    });
    H.editDashboard();

    H.createQuestion(QUESTION);
    addQuestion(QUESTION.name);

    H.setFilter("Text or Category", "Is");
    mapFilterToQuestion("Name");
    H.sidebar().findByText("A single value").click();

    H.saveDashboard();

    H.filterWidget().click();
    H.popover().within(() => {
      cy.findByText("Zackery Bailey").should("not.exist");
      cy.findByPlaceholderText("Search the list").type("Zackery");
      cy.findByText("Zackery Bailey").should("be.visible");
      cy.findByText("Zackery Kuhn").should("be.visible").click();

      cy.findByPlaceholderText("Search the list").should(
        "have.value",
        "Zackery Kuhn",
      );

      cy.findByText("Zackery Bailey").should("be.visible");
    });
  });

  function addQuestion(name) {
    H.openQuestionsSidebar();
    cy.findByTestId("add-card-sidebar").findByText(name).click();
  }

  const mapFilterToQuestion = (column = "Category") => {
    cy.findByText("Select…").click();
    H.popover().within(() => cy.findByText(column).click());
  };
});

describe("issue 44665", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should use the correct widget for the default value picker (metabase#44665)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from {{param");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar()
      .last()
      .within(() => {
        cy.findByText("Search box").click();
        cy.findByText("Edit").click();
      });

    H.modal().within(() => {
      cy.findByText("Custom list").click();
      cy.findByRole("textbox").type("foo\nbar\nbaz\nfoobar");
      cy.button("Done").click();
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar().last().findByText("Enter a default value…").click();
    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a default value…")
        .should("be.visible")
        .type("foo");
      cy.findByText("foo").should("be.visible");
      cy.findByText("foobar").should("be.visible");

      cy.findByText("bar").should("not.exist");
      cy.findByText("baz").should("not.exist");
    });

    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.sidebar()
      .last()
      .within(() => {
        cy.findByText("Enter a default value…").click();
        cy.findByText("Dropdown list").click();
        cy.findByText("Enter a default value…").click();
      });

    H.popover().within(() => {
      cy.findByPlaceholderText("Enter a default value…").should("be.visible");

      cy.findByText("foo").should("be.visible");
      cy.findByText("bar").should("be.visible");
      cy.findByText("baz").should("be.visible");
      cy.findByText("foobar").should("be.visible");
    });
  });
});

describe("issue 50731", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(800, 800);
  });

  it("tooltip content should not overflow the tooltip (metabase#50731)", () => {
    H.openOrdersTable();
    cy.icon("filter").click();
    cy.icon("label").realHover();

    H.popover()
      .should("be.visible")
      .and(($element) => {
        const [container] = $element;
        const descendants = container.querySelectorAll("*");

        descendants.forEach((descendant) => {
          H.assertDescendantNotOverflowsContainer(descendant, container);
        });
      });
  });
});

describe("issue 58923", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.viewport(800, 800);
  });

  it("it should not lose padding when switching filter types (metabase#58923)", () => {
    H.openPeopleTable();
    H.tableHeaderClick("Name");

    H.popover().findByText("Filter by this column").click();
    H.popover().findByText("Is").click();
    H.popover().should("have.length", 2).last().findByText("Contains").click();

    H.popover().findByText("Contains").click();
    H.popover().should("have.length", 2).last().findByText("Is").click();

    H.popover()
      .first()
      .within(() => {
        cy.findByPlaceholderText("Search by Name").then((input) => {
          cy.button("Add filter")
            .parent()
            .then((footer) => {
              const { bottom } = input[0].getBoundingClientRect();
              const { top } = footer[0].getBoundingClientRect();

              cy.wrap(top - bottom).should("be.gt", 16);
            });
        });
      });
  });
});

describe("issue QUE-1359", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should render an outline on the custom expression item in the filter popover (QUE-1359)", () => {
    H.openReviewsTable({ mode: "notebook" });
    H.filter({ mode: "notebook" });

    Cypress._.times(10, () => cy.realPress("ArrowDown"));

    H.popover()
      .findByText("Custom Expression")
      .parent()
      .then((el) => {
        cy.wrap(window.getComputedStyle(el[0]).outline).should(
          "contain",
          "solid",
        );
      });
  });
});

describe("issue QUE-2567", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Foo: [
              "datetime-add",
              [
                "field",
                ORDERS.CREATED_AT,
                {
                  "base-type": "type/DateTime",
                  "effective-type": "type/DateTime",
                },
              ],
              5,
              "day",
            ],
            Bar: ["datetime", "2025-12-24"],
          },
        },
      },
      { visitQuestion: true },
    );

    H.filter();
    H.popover().within(() => {
      cy.findByText("Foo").click();
      cy.findByText("Previous 12 months").click();
    });

    H.filter();
    H.popover().within(() => {
      cy.findByText("Bar").click();
      cy.findByText("Previous 12 months").click();
    });
  });

  it("should be possible to edit a datetime filter that is based on a custom expression (QUE-2567)", () => {
    cy.log("Editing the filter should show the date picker");
    cy.findAllByTestId("filter-pill").should("have.length", 2).eq(0).click();
    H.popover().within(() => {
      cy.findByText("Previous").should("be.visible");
      cy.findByText("Current").should("be.visible");
      cy.findByText("Next").should("be.visible");
    });

    cy.log(
      "Editing the filter should show the date picker for coerced datetime",
    );
    cy.findAllByTestId("filter-pill").should("have.length", 2).eq(1).click();
    H.popover().within(() => {
      cy.findByText("Previous").should("be.visible");
      cy.findByText("Current").should("be.visible");
      cy.findByText("Next").should("be.visible");
    });
  });
});

describe("issue QUE-2567 (bis)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      coercion_strategy: "Coercion/UNIXSeconds->DateTime",
      semantic_type: null,
    });
    H.openOrdersTable();

    H.filter();
    H.popover().within(() => {
      cy.findByText("Quantity").click();
      cy.findByText("Previous 12 months").click();
    });
  });

  it("should open the datetime filter for coerced columns", () => {
    cy.log("Editing the filter should show the date picker");
    cy.findByTestId("filter-pill").click();
    H.popover().within(() => {
      cy.findByText("Previous").should("be.visible");
      cy.findByText("Current").should("be.visible");
      cy.findByText("Next").should("be.visible");
    });
  });
});

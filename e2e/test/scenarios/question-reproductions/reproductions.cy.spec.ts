const { H } = cy;

import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";
import type {
  NativeQuestionDetails,
  StructuredQuestionDetails,
} from "e2e/support/helpers";
import type { Filter, LocalFieldReference } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("issue 39487", () => {
  const CREATED_AT_FIELD: LocalFieldReference = [
    "field",
    ORDERS.CREATED_AT,
    {
      "base-type": "type/DateTime",
    },
  ];

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it(
    "calendar has constant size when using single date picker filter (metabase#39487)",
    { viewportHeight: 1000 },
    () => {
      createTimeSeriesQuestionWithFilter([">", CREATED_AT_FIELD, "2015-01-01"]); // 5 day rows

      cy.log("timeseries filter button");
      cy.findByTestId("timeseries-filter-button").click();
      checkSingleDateFilter();

      cy.log("filter pills");
      cy.findByTestId("filters-visibility-control").click();
      cy.findByTestId("filter-pill").click();
      checkSingleDateFilter();

      cy.log("filter picker");
      cy.button(/Filter/).click();
      H.popover().within(() => {
        cy.findByText("Created At").click();
        cy.findByText("Fixed date range…").click();
      });
      checkSingleDateFilter();
      cy.realPress("Escape");

      cy.log("filter drill");
      cy.findByLabelText("Switch to data").click();
      H.tableHeaderClick("Created At: Year");
      H.popover().findByText("Filter by this column").click();

      cy.log("verify that previous popover is closed before opening new one");
      H.popover().findByText("Filter by this column").should("not.exist");

      H.popover().findByText("Fixed date range…").click();
      H.popover().findByText("After").click();
      H.popover().findByRole("textbox").clear().type("2015/01/01");
      checkSingleDateFilter();

      cy.log("notebook editor");
      H.openNotebook();
      H.getNotebookStep("filter")
        .findAllByTestId("notebook-cell-item")
        .first()
        .click();
      checkSingleDateFilter();
    },
  );

  it(
    "calendar has constant size when using date range picker filter, and text inputs are in sync with the calendar inputs (metabase#39487, metabase#64602)",
    { viewportHeight: 1000 },
    () => {
      createTimeSeriesQuestionWithFilter([
        "between",
        CREATED_AT_FIELD,
        "2027-05-01", // 5 day rows
        "2027-06-01", // 6 day rows
      ]);

      cy.log("timeseries filter button");
      cy.findByTestId("timeseries-filter-button").click();
      checkDateRangeFilter();

      cy.log("filter pills");
      cy.findByTestId("filters-visibility-control").click();
      cy.findByTestId("filter-pill").click();
      checkDateRangeFilter();

      cy.log("filter dropdown");
      cy.button(/Filter/).click();
      H.popover().findByText("Created At").click();
      H.popover().findByText("Fixed date range…").click();
      H.popover().within(() => {
        cy.log(
          "changing text input values should navigate the calendars (metabase#64602)",
        );
        cy.findAllByRole("textbox").first().clear().type("2027/05/01");
        cy.findByText("May 2027").should("be.visible");
        cy.findByLabelText("1 May 2027").should(
          "have.attr",
          "data-first-in-range",
          "true",
        );

        cy.findAllByRole("textbox")
          .should("have.length", 2)
          .last()
          .clear()
          .type("2027/06/01");
        cy.findAllByLabelText("1 June 2027")
          .filter(":visible")
          .should("have.length", 1)
          .and("have.attr", "data-last-in-range", "true");
      });
      previousButton().click();
      checkDateRangeFilter();
      cy.realPress("Escape");

      cy.log("filter drill");
      cy.findByLabelText("Switch to data").click();
      H.tableHeaderClick("Created At: Year");
      H.popover().findByText("Filter by this column").click();
      H.popover().findByText("Fixed date range…").click();
      H.popover().findAllByRole("textbox").first().clear().type("2027/05/01");
      H.popover()
        .findAllByRole("textbox")
        .should("have.length", 2)
        .last()
        .clear()
        .type("2027/06/01");
      previousButton().click();
      checkDateRangeFilter();

      cy.log("notebook editor");
      H.openNotebook();
      H.getNotebookStep("filter")
        .findAllByTestId("notebook-cell-item")
        .first()
        .click();
      checkDateRangeFilter();
    },
  );

  it("date picker is scrollable when overflows (metabase#39487)", () => {
    createTimeSeriesQuestionWithFilter([
      ">",
      CREATED_AT_FIELD,
      "2015-03-01", // 6 day rows
    ]);

    H.openNotebook();
    H.getNotebookStep("filter")
      .findAllByTestId("notebook-cell-item")
      .first()
      .click();
    H.popover().findByTestId("popover-content").scrollTo("bottom");
    H.popover().button("Update filter").should("be.visible").click();
  });

  function createTimeSeriesQuestionWithFilter(filter: Filter) {
    H.createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
          filter,
        },
        display: "line",
      },
      { visitQuestion: true },
    );
  }

  function checkSingleDateFilter() {
    measureInitialValues();

    nextButton().click(); // go to 2015-02 - 4 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-03 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-04 - 5 day rows
    assertNoLayoutShift();

    nextButton().click(); // go to 2015-05 - 6 day rows
    assertNoLayoutShift();
  }

  function checkDateRangeFilter() {
    measureInitialValues();

    nextButton().click(); // go to 2027-07 - 5 day rows
    assertNoLayoutShift();
  }

  function measureInitialValues() {
    measureDatetimeFilterPickerHeight().then((initialPickerHeight) => {
      cy.wrap(initialPickerHeight).as("initialPickerHeight");
    });
    measureNextButtonRect().then((nextButtonRect) => {
      cy.wrap(nextButtonRect).as("nextButtonRect");
    });
    measurePreviousButtonRect().then((previousButtonRect) => {
      cy.wrap(previousButtonRect).as("previousButtonRect");
    });
  }

  function assertNoLayoutShift() {
    assertDatetimeFilterPickerHeightDidNotChange();
    assertPreviousButtonRectDidNotChange();
    assertNextButtonRectDidNotChange();
  }

  function assertDatetimeFilterPickerHeightDidNotChange() {
    cy.get("@initialPickerHeight").then((initialPickerHeight) => {
      measureDatetimeFilterPickerHeight().then((height) => {
        expect(height).to.eq(initialPickerHeight);
      });
    });
  }

  function assertPreviousButtonRectDidNotChange() {
    cy.get("@previousButtonRect").then((previousButtonRect) => {
      measurePreviousButtonRect().then((rect) => {
        expect(rect).to.deep.eq(previousButtonRect);
      });
    });
  }

  function assertNextButtonRectDidNotChange() {
    cy.get("@nextButtonRect").then((nextButtonRect) => {
      measureNextButtonRect().then((rect) => {
        expect(rect).to.deep.eq(nextButtonRect);
      });
    });
  }

  function measureDatetimeFilterPickerHeight() {
    return H.popover().then(([$element]) => {
      const { height } = $element.getBoundingClientRect();
      return height;
    });
  }

  function measureNextButtonRect() {
    return nextButton().then(([$element]) => {
      return $element.getBoundingClientRect();
    });
  }

  function measurePreviousButtonRect() {
    return previousButton().then(([$element]) => {
      return $element.getBoundingClientRect();
    });
  }

  function nextButton() {
    return H.popover().get("button[data-direction=next]");
  }

  function previousButton() {
    return H.popover().get("button[data-direction=previous]");
  }
});

describe("issue 14124", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not include date when metric is binned by hour of day (metabase#14124)", () => {
    cy.request("PUT", `/api/field/${ORDERS.CREATED_AT}`, {
      semantic_type: null,
    });

    H.createQuestion(
      {
        name: "14124",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.findAllByRole("columnheader", {
      name: "Created At: Hour of day",
    }).should("be.visible");

    cy.log("Reported failing in v0.37.2");
    cy.findAllByRole("gridcell", { name: "3:00 AM" }).should("be.visible");
  });
});
const MONGO_DB_ID = 2;

describe("issue 47793", () => {
  const questionDetails: NativeQuestionDetails = {
    database: MONGO_DB_ID,
    native: {
      query: `[
  { $match: { quantity: {{quantity}} }},
  {
    "$project": {
      "_id": "$_id",
      "id": "$id",
      "user_id": "$user_id",
      "product_id": "$product_id",
      "subtotal": "$subtotal",
      "tax": "$tax",
      "total": "$total",
      "created_at": "$created_at",
      "quantity": "$quantity",
      "discount": "$discount"
    }
  },
  {
    "$limit": 1048575
  }
]`,
      "template-tags": {
        quantity: {
          type: "number",
          name: "quantity",
          id: "754ae827-661c-4fc9-b511-c0fb7b6bae2b",
          "display-name": "Quantity",
          default: "10",
        },
      },
      collection: "orders",
    },
  };

  beforeEach(() => {
    H.restore("mongo-5");
    cy.signInAsAdmin();
  });

  it(
    "should be able to preview queries for mongodb (metabase#47793)",
    { tags: ["@external", "@mongo"] },
    () => {
      H.createNativeQuestion(questionDetails, { visitQuestion: true });
      cy.findByTestId("visibility-toggler")
        .findByText(/open editor/i)
        .click();
      cy.findByTestId("native-query-editor-container")
        .findByLabelText("Preview the query")
        .click();
      H.modal()
        .should("contain.text", "$project")
        .and("contain.text", "quantity: 10");
    },
  );
});
describe("issue 53170", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it(
    "should correctly position the add column popover (metabase#53170)",
    { viewportWidth: 480, viewportHeight: 800 },
    () => {
      H.openOrdersTable();
      cy.findByLabelText("Add column").click();
      H.popover().within(() => {
        cy.findByText("Combine columns").click();
        cy.button("Done").then(($button) => {
          const buttonRight = $button[0].getBoundingClientRect().right;
          cy.window().its("innerWidth").should("be.gt", buttonRight);
        });
      });
    },
  );
});

describe("issue 54817", () => {
  const placeholder = "Find...";

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow to navigate to the search input in the filter picker via keyboard (metabase#54817)", () => {
    H.openOrdersTable();
    H.filter();
    H.popover().findByPlaceholderText(placeholder).should("be.focused");
  });
});

describe("issue 57398", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show the query running state when navigating back (metabase#57398)", () => {
    H.openProductsTable();
    H.filter();
    H.popover().within(() => {
      cy.log("1st filter");
      cy.findByText("Category").click();
      cy.findByText("Widget").click();
      cy.findByLabelText("Add another filter").click();

      cy.log("2st filter");
      cy.findByText("Vendor").click();
      cy.findByText("Alfreda Konopelski II Group").click();
      cy.findByLabelText("Add another filter").click();
    });

    cy.log("delay the response to be able to verify the running state");
    cy.intercept("POST", "/api/dataset", (req) => {
      req.on("response", (res) => {
        res.setDelay(5000);
      });
    });

    cy.go("back");
    H.queryBuilderMain().findByTestId("loading-indicator").should("be.visible");
    H.queryBuilderFiltersPanel().within(() => {
      cy.findByText("Category is Widget").should("be.visible");
      cy.findByText("Vendor is Alfreda Konopelski II Group").should(
        "not.exist",
      );
    });
  });
});

describe("issue 46845", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to run a query with multiple implicit joins for a native model (metabase#46845)", () => {
    cy.log("create a native model with 2 FKs to the same table");
    H.createNativeQuestion(
      {
        name: "Model",
        type: "model",
        native: {
          query:
            "SELECT 1 AS PK, 5 AS FK1, 9 AS FK2 " +
            "UNION ALL " +
            "SELECT 2 AS PK, 4 AS FK1, 7 AS FK2",
        },
      },
      { visitQuestion: true },
    );
    H.openQuestionActions("Edit metadata");
    H.openColumnOptions("PK");
    H.mapColumnTo({ table: "Orders", column: "ID" });
    H.renameColumn("ID", "PK");

    H.openColumnOptions("FK1");
    H.mapColumnTo({ table: "Orders", column: "Product ID" });
    H.renameColumn("Product ID", "First Product ID");

    H.openColumnOptions("FK2");
    H.mapColumnTo({ table: "Orders", column: "Product ID" });
    H.renameColumn("Product ID", "Second Product ID");
    H.saveMetadataChanges();

    cy.log("verify filtering on 2 different implicit column groups");
    H.openNotebook();
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("First Product").click();
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.getNotebookStep("filter").icon("add").click();
    H.popover().within(() => {
      cy.findByText("Second Product").click();
      cy.findByText("Category").click();
      cy.findByText("Widget").click();
      cy.button("Add filter").click();
    });
    H.visualize();
    H.assertQueryBuilderRowCount(1);
  });
});
describe("54205", () => {
  beforeEach(() => {
    H.restore("postgres-writable");

    cy.signInAsAdmin();

    H.queryWritableDB("DROP TABLE IF EXISTS products");
    H.queryWritableDB(
      "CREATE TABLE IF NOT EXISTS products (id INT PRIMARY KEY, category VARCHAR, name VARCHAR)",
    );
    H.queryWritableDB(
      "INSERT INTO products (id, category, name) VALUES (1, 'A', 'Foo, Bar'), (2, 'B', 'Foo, Baz')",
    );
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "products" });
  });

  it("should be able to select a comma separated value", () => {
    H.getTableId({
      name: "products",
    }).then((tableId) => {
      H.getFieldId({
        tableId,
        name: "name",
      }).then((fieldId) => {
        cy.request("PUT", `/api/field/${fieldId}`, {
          has_field_values: "search",
        });
      });

      H.createTestQuery({
        database: WRITABLE_DB_ID,
        stages: [
          {
            source: {
              type: "table",
              id: tableId,
            },
          },
        ],
      }).then((query) => {
        H.createCard({
          name: "Q 54205",
          dataset_query: query,
        }).then((card) => {
          cy.wrap(card.id).as("questionId");
          H.visitQuestion(card.id);
        });
      });
    });

    cy.findByTestId("query-visualization-root").contains("Name").click();

    H.popover().within(() => {
      cy.findByText("Filter by this column").click();
      cy.findByPlaceholderText("Search by Name").type("Foo");
      cy.findByRole("option", { name: "Foo, Bar" }).click();
      cy.findByRole("list").should("have.text", "Foo, Bar");
    });
  });
});
describe("issue 42723", () => {
  const questionDetails: StructuredQuestionDetails = {
    display: "line",
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CREATED_AT, { "base-type": "type/DateTime" }],
        ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be able to change the query without loosing the viz type (metabase#42723)", () => {
    H.createQuestion(questionDetails, { visitQuestion: true });
    H.queryBuilderFooter().findByLabelText("Switch to data").click();
    H.tableHeaderClick("Count");
    H.popover().icon("arrow_up").click();
    H.tableInteractiveHeader().icon("chevronup").should("be.visible");

    H.queryBuilderFooter().findByLabelText("Switch to visualization").click();
    H.ensureChartIsActive();
  });
});

describe("issue 58628", () => {
  beforeEach(() => {
    H.restore();
    cy.signIn("nodata");
  });

  it("should show the unauthorized page when accessing the notebook editor without data perms (metabase#58628)", () => {
    cy.log("should not be able to access the notebook editor");
    cy.visit("/question/notebook");
    cy.url().should("include", "/unauthorized");
    H.main()
      .findByText("Sorry, you don’t have permission to see that.")
      .should("be.visible");

    cy.log("should be able to access the query builder in view mode");
    H.visitQuestion(ORDERS_QUESTION_ID);
    H.queryBuilderHeader().should("be.visible");
  });
});

describe("issue 52872", () => {
  const LONG_NAME = "a".repeat(254);

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: LONG_NAME,
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );
  });

  it("Saved questions with a very long title should wrap (metabse#52872)", () => {
    cy.findByDisplayValue(LONG_NAME)
      .should("be.visible")
      .then(($el) => {
        cy.window().then((window) => {
          cy.wrap($el[0].offsetWidth).should("be.lt", window.innerWidth);
        });
      });
  });
});
describe("issue 13347", () => {
  beforeEach(() => {
    H.restore();
    H.restore("postgres-12");
    cy.signInAsAdmin();

    H.createQuestion({
      name: "13347 structured",
      database: WRITABLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
      },
    });

    H.createNativeQuestion({
      name: "13347 native",
      database: WRITABLE_DB_ID,
      native: {
        query: "SELECT * FROM ORDERS",
      },
    });

    // The normal user belongs to the data group, which would otherwise get
    // query-builder access to this database by default. Revoke create-queries so
    // the user cannot build new questions on it - the condition this issue is
    // about. (Avoid view-data "blocked", which needs the advanced-permissions
    // token feature this spec doesn't have.)
    cy.updatePermissionsGraph({
      [USER_GROUPS.DATA_GROUP]: {
        [WRITABLE_DB_ID]: {
          "view-data": "unrestricted",
          "create-queries": "no",
        },
      },
    });

    cy.signInAsNormalUser();

    cy.visit("/");
  });

  it("should not display questions in mini data picker that cannot be used for new questions (metabase#13347)", () => {
    H.startNewQuestion();
    H.miniPickerOurAnalytics().click();

    H.miniPicker().within(() => {
      cy.findByText("Orders").should("exist");

      cy.findByText("13347 structured").should("not.exist");
      cy.findByText("13347 native").should("not.exist");
    });
  });

  it("should not display questions in big data picker that cannot be used for new questions (metabase#13347)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();

    H.entityPickerModalItem(1, "Sample Database").click();

    H.entityPickerModalLevel(2).within(() => {
      cy.findByText("Orders").should("exist");

      cy.findByText("13347 structured").should("not.exist");
      cy.findByText("13347 native").should("not.exist");
    });
  });
});

describe("issue #47005", () => {
  beforeEach(() => {
    H.restore();
    H.restore("postgres-12");
    cy.signInAsNormalUser();

    H.createQuestion({
      name: "Question A",
      query: {
        "source-table": ORDERS_ID,
      },
    }).then(({ body: question }) => {
      H.createQuestion(
        {
          name: "Question B",
          query: {
            "source-table": "card__" + question.id,
          },
        },
        { visitQuestion: true },
      );
    });
  });

  it("should show the collection of the base question in breadcrumbs (metabase#47005)", () => {
    cy.findAllByTestId("head-crumbs-container")
      .filter(":contains(Question A)")
      .findByText("Our analytics")
      .should("be.visible");
  });
});

describe("issue 66210", () => {
  const METRIC_NAME = "66210 metric";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion({
      name: METRIC_NAME,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      type: "metric",
    });

    cy.visit("/");
  });

  it("should not allow you to join on metrics", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalItem(1, METRIC_NAME).should("be.visible");
    H.entityPickerModalItem(1, "Orders").click();
    H.join();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Our analytics").click();
    H.entityPickerModalLevel(1).findByText(METRIC_NAME).should("not.exist");
  });
});

describe("issue #67903", () => {
  beforeEach(() => {
    cy.viewport(630, 800);
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show preview table headers on top of other elements (metabase#67903)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });
    H.getNotebookStep("data").findByTestId("step-preview-button").click();
    H.queryBuilderHeader().findByLabelText("View SQL").click();
    cy.findByTestId("table-header").should("not.be.visible");
  });
});

describe("issue #67767", () => {
  const SCREEN_WIDTH = 630;

  beforeEach(() => {
    cy.viewport(SCREEN_WIDTH, 800);
    H.restore();
    cy.signInAsAdmin();
  });

  it("only show preview query at full width on small screens (metabase#67767)", () => {
    H.startNewQuestion();
    H.miniPickerBrowseAll().click();
    H.pickEntity({ path: ["Databases", /Sample Database/, "Orders"] });
    H.getNotebookStep("data").findByTestId("step-preview-button").click();
    H.queryBuilderHeader().findByLabelText("View SQL").click();
    H.sidebar()
      .findByText("SQL for this question")
      .then(($el) => {
        expect($el.get(0).scrollWidth).to.eq(SCREEN_WIDTH);
      });
  });
});

describe("issue 68574", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    const questionDetails: NativeQuestionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM ORDERS WHERE CREATED_AT > {{ start }}",
        "template-tags": {
          start: {
            type: "date",
            name: "start",
            "display-name": "Start",
            id: "1",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "start",
          required: true,
          name: "Start",
          type: "date/single",
          target: ["variable", ["template-tag", "start"]],
        }),
      ],
    };

    H.createNativeQuestion(questionDetails, { wrapId: true });
  });

  it("should be possible to run a query for a empty required parameter without a default value (metabase#68574)", () => {
    updateFormattingSettings({
      date_style: "D MMMM, YYYY",
      date_abbreviate: false,
    });
    visitQuestion("2027-01-01");
    assertParameterFormat("1 January, 2027");

    cy.log("change the date format");
    updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: false,
    });
    visitQuestion("2027-01-01");
    assertParameterFormat("Friday, January 1, 2027");

    cy.log("enable date abbreviation");
    updateFormattingSettings({
      date_style: "dddd, MMMM D, YYYY",
      date_abbreviate: true,
    });
    visitQuestion("2027-01-01");
    assertParameterFormat("Fri, Jan 1, 2027");

    cy.log("even when the setting is unset, it should render a valid format");
    updateFormattingSettings(undefined);
    visitQuestion("2027-01-01");
    assertParameterFormat("January 1, 2027");
  });

  function updateFormattingSettings(settings: any) {
    H.updateSetting("custom-formatting", {
      "type/Temporal": settings,
    });
  }

  function visitQuestion(value: string) {
    cy.get("@questionId").then((id) => {
      cy.visit(`/question/${id}?start=${value}`);
    });
  }

  function assertParameterFormat(value: string) {
    cy.findByTestId("parameter-value-widget-target")
      .should("be.visible")
      .should("contain.text", value);
  }
});

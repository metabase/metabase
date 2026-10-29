const { H } = cy;

import {
  SAMPLE_DB_ID,
  USER_GROUPS,
  WRITABLE_DB_ID,
} from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { NativeQuestionDetails } from "e2e/support/helpers";
import type {
  Database,
  IconName,
  ListDatabasesResponse,
} from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { getRunQueryButton, runQuery } from "./helpers/e2e-sql-filter-helpers";

const { ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("issue 12439", () => {
  const nativeQuery = `
  SELECT "PRODUCTS__via__PRODUCT_ID"."CATEGORY" AS "CATEGORY",
         date_trunc('month', "ORDERS"."CREATED_AT") AS "CREATED_AT",
         count(*) AS "count"
  FROM "ORDERS"
  LEFT JOIN "PRODUCTS" "PRODUCTS__via__PRODUCT_ID"
         ON "ORDERS"."PRODUCT_ID" = "PRODUCTS__via__PRODUCT_ID"."ID"
  GROUP BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY",
           date_trunc('month', "ORDERS"."CREATED_AT")
  ORDER BY "PRODUCTS__via__PRODUCT_ID"."CATEGORY" ASC,
           date_trunc('month', "ORDERS"."CREATED_AT") ASC
  `;

  const questionDetails = {
    dataset_query: {
      database: SAMPLE_DB_ID,
      native: {
        query: nativeQuery,
      },
      type: "native",
    },
    display: "line",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.visitQuestionAdhoc(questionDetails);
  });

  it("should allow clicking on a legend in a native question without breaking the UI (metabase#12439)", () => {
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("Gizmo").click();

      // Make sure the legends and the graph are still there
      cy.findByText("Gizmo").should("be.visible");
      cy.findByText("Doohickey").should("be.visible");

      H.cartesianChartCircle();
    });

    // Make sure buttons are clickable
    H.openVizSettingsSidebar();

    H.sidebar().contains("X-axis");
    H.sidebar().contains("Y-axis");
  });
});

describe("issue 17060", () => {
  const ORIGINAL_QUERY =
    'select ID as "num", CATEGORY as "text" from PRODUCTS limit 1';
  const SECTION = "select ";
  const SELECTED_TEXT = "ID";

  function rearrangeColumns() {
    cy.findAllByTestId(/draggable-item/)
      .first()
      .trigger("mousedown", 0, 0, { force: true })
      .trigger("mousemove", 5, 5, { force: true })
      .trigger("mousemove", 0, 100, { force: true })
      .trigger("mouseup", 0, 100, { force: true });
  }

  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");

    H.restore();
    cy.signInAsAdmin();
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: ORIGINAL_QUERY,
        },
      },
      visualization_settings: {},
    });

    H.openVizSettingsSidebar();
    cy.findByTestId("sidebar-left").within(() => {
      rearrangeColumns();
    });
  });

  it("should not render duplicated columns (metabase#17060)", () => {
    H.NativeEditor.focus();
    cy.realPress("Home");
    Cypress._.range(SECTION.length).forEach(() => cy.realPress("ArrowRight"));
    Cypress._.range(SELECTED_TEXT.length).forEach(() =>
      cy.realPress(["Shift", "ArrowRight"]),
    );
    H.NativeEditor.type("RATING", { focus: false });
    runQuery();

    H.tableInteractiveBody().findByText("4.6").should("be.visible");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.findAllByTestId("header-cell").should("have.length", 2);
      cy.findByText("num").should("be.visible");
    });
  });
});

describe("issue 19451", () => {
  const question = {
    name: "19451",
    native: {
      query: "select count(*) from products where {{filter}}",
      "template-tags": {
        filter: {
          id: "1b33304a-18ea-cc77-083a-b5225954f200",
          name: "filter",
          "display-name": "Filter",
          type: "dimension",
          dimension: ["field", PRODUCTS.ID, null],
          "widget-type": "id",
          default: null,
        },
      },
    },
    display: "scalar",
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createNativeQuestion(question, { visitQuestion: true });
  });

  it("question field filter shows all tables from a selected database (metabase#19451, metabase#23510)", () => {
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Open Editor").click();

    cy.log("The data reference loads uncached metadata (metabase#23510)");
    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("ORDERS");
      cy.findByText("PRODUCTS");
      cy.findByText("REVIEWS");
      cy.findByText("PEOPLE");
      cy.findByText("Sample Database");
    });

    cy.icon("variable").click();
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    cy.icon("chevronleft").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews");
  });
});

describe("issue 31926", { tags: "@external" }, () => {
  const databaseName = "Sample Database";
  const databaseCopyName = `${databaseName} copy`;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should disable running and saving after switching a field filter query to another database (metabase#31926)", () => {
    // Second DB (copy)
    H.addPostgresDatabase(databaseCopyName);

    // Create a native query and run it
    H.startNewNativeQuestion();
    H.NativeEditor.type("SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}");

    cy.findByTestId("variable-type-select").click();
    H.popover().within(() => {
      cy.findByText("Field Filter").click();
    });
    H.popover().within(() => {
      cy.findByText("Products").click();
    });
    H.popover().within(() => {
      cy.findByText("Category").click();
    });

    cy.findByTestId("native-query-editor-container").icon("play").click();
    cy.findByTestId("scalar-value").should("have.text", "200");
    cy.findByTestId("qb-save-button").should("not.have.attr", "data-disabled");

    // Change DB
    // and re-run the native query
    cy.findByTestId("native-query-editor-container")
      .findByText("Sample Database")
      .click();
    H.popover().within(() => {
      cy.findByText(databaseCopyName).click();
    });
    // run button disabled
    cy.findAllByTestId("run-button").filter(":visible").should("be.disabled");

    // Try to save the native query
    // save button disabled
    cy.findByTestId("qb-save-button").should(
      "have.attr",
      "data-disabled",
      "true",
    );
  });
});

describe("issue 30680", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not render native editor buttons when 'Columns' tab is open (metabase#30680, metabase#53649)", () => {
    H.startNewNativeModel();

    cy.log("The native editor does not freeze (metabase#53649)");
    H.NativeEditor.type("select 1");
    H.NativeEditor.get().should("contain", "select 1");

    cy.findByTestId("editor-tabs-columns").should("be.disabled");

    H.runNativeQuery();
    cy.findByTestId("editor-tabs-columns").should("not.be.disabled");
    cy.findByTestId("native-query-editor-action-buttons").should("be.visible");
    cy.findByTestId("editor-tabs-columns-name").click();

    cy.findByTestId("sidebar-content").should("exist");
    cy.findByTestId("native-query-editor-action-buttons").should("not.exist");
  });
});

describe("issue 34330", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.startNewNativeQuestion();

    cy.intercept({
      method: "GET",
      pathname: `/api/database/${SAMPLE_DB_ID}/autocomplete_suggestions`,
    }).as("autocomplete");

    H.clearBrowserCache();
  });

  it("should only call the autocompleter with all text typed (metabase#34330)", () => {
    cy.findByTestId("query-visualization-root")
      .findByText("Here's where your results will appear")
      .should("be.visible");

    H.NativeEditor.type("SEAT", { delay: 10 });
    H.NativeEditor.completion("SEATS").should("be.visible");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("SEAT");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter eventually and only once, even when only 1 character was typed (metabase#34330, metabase#21034)", () => {
    H.NativeEditor.type("S", { delay: 10 });
    H.NativeEditor.completion("SEATS").should("be.visible");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("S");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);

    cy.log(
      "should not invoke API calls for autocomplete twice in a row (metabase#21034)",
    );
    // Wait until another explicit autocomplete could be triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    cy.wait(1000);
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter when backspacing to a 1-character prefix (metabase#34330)", () => {
    H.NativeEditor.type("SEAT{backspace}", { delay: 10 });
    H.NativeEditor.completion("SEATS").should("be.visible");

    cy.wait("@autocomplete").should(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("SEA");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });
});

describe("issue 35344", () => {
  const questionDetails = {
    name: "REVIEWS SQL",
    native: { query: "select REVIEWER from REVIEWS" },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not allow the user to undo to the empty editor (metabase#35344)", () => {
    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();

    // make sure normal undo still works
    H.NativeEditor.type("--");
    H.NativeEditor.get().should("contain", "--");

    H.NativeEditor.focus();
    cy.realPress(["Meta", "z"]);
    H.NativeEditor.get().findByText("--").should("not.exist");

    // more undoing does not change to empty editor
    H.NativeEditor.focus();
    cy.realPress(["Meta", "z"]);
    H.NativeEditor.get().should("contain", "select REVIEWER from REVIEWS");
  });
});

describe("issue 35785", () => {
  const nativeQuery =
    "select * from products where created_at < {{max_date}} and created_at > {{from}} limit 5";

  const questionDetails = {
    native: {
      query: nativeQuery,
      "template-tags": {
        max_date: {
          id: "32b7654f-38b1-2dfd-ded6-ed23c45ef5f6",
          name: "max_date",
          "display-name": "Max date",
          type: "date",
          default: "2030-01-01",
          required: true,
        },
        from: {
          id: "ddf7c404-38db-8b65-f90d-c6f4bd8127ec",
          name: "from",
          "display-name": "From",
          type: "date",
          default: "2025-10-02",
          required: true,
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.intercept("GET", "/api/search?*").as("getSearchResults");
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should not redirect to the value of 'from' URL parameter after saving (metabase#35785)", () => {
    cy.findByTestId("native-query-editor-container")
      .findByTestId("visibility-toggler")
      .click();
    H.NativeEditor.type("{backspace}4");

    cy.findByTestId("qb-header").findByRole("button", { name: "Save" }).click();

    cy.findByTestId("save-question-modal").findByText("Save").click();

    cy.wait("@updateCard");
    cy.wait("@getSearchResults");

    cy.findByTestId("save-question-modal").should("not.exist");
    cy.location("pathname").should("match", /^\/question\/\d+/);
  });
});

describe("issue 22991", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show 'no permissions' screen when question with no access is referenced (metabase#22991)", () => {
    const questionDetails = {
      name: "question 22991",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
    };

    H.createCollection({ name: "Restricted Collection" }).then(
      ({ body: restrictedCollection }) => {
        cy.updateCollectionGraph({
          [USER_GROUPS.COLLECTION_GROUP]: {
            [restrictedCollection.id]: "none",
          },
        });

        H.createQuestion(
          {
            ...questionDetails,
            collection_id: restrictedCollection.id,
          },
          { wrapId: true },
        );
      },
    );

    cy.signOut();
    cy.signInAsNormalUser();

    H.startNewNativeQuestion();
    cy.get("@questionId").then((questionId) => {
      // can't use cy.type because it does not simulate the bug
      H.NativeEditor.type(`select * from {{#${questionId}`);
      H.NativeEditor.get()
        .should("be.visible")
        .and("contain.text", `#${questionId}`);
    });

    cy.get("main").should(
      "not.contain",
      "Sorry, you don’t have permission to see that",
    );
  });
});

describe("issue 46308", () => {
  const nativeQuery =
    "select category, count(*) from products where category != {{exclude}} group by category";

  const questionDetails = {
    native: {
      query: nativeQuery,
      "template-tags": {
        exclude: {
          id: "ddf7c404-38db-8b65-f90d-c6f4bd8127ec",
          name: "exclude",
          "display-name": "Exclude",
          type: "text",
        },
      },
    },
    display: "line",
    visualization_settings: {
      "graph.metrics": ["category"],
      "graph.dimensions": ["count"],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should persist viz settings when saving a question without a required filter selected (metabase#46308)", () => {
    cy.findByTestId("native-query-editor-container")
      .findByTestId("visibility-toggler")
      .click();

    cy.icon("variable").click();
    cy.get("input[value=Exclude]").eq(0).type(" Category").blur();

    cy.findByTestId("qb-save-button").click();
    cy.findByTestId("save-question-modal").findByText("Save").click();

    cy.findByPlaceholderText("Exclude Category").type("Doohickey");
    getRunQueryButton().click();

    H.cartesianChartCircle().should("have.length", 3);
  });
});

describe("issue 38176", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/**").as("updateQuestion");
  });

  it("restoring a question to a previous version should preserve the variables (metabase#38176)", () => {
    H.createNativeQuestion(
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

    cy.findByTestId("qb-header").icon("play").click();

    H.questionInfoButton().click();
    H.sidesheet().within(() => {
      cy.findByPlaceholderText("Add description")
        .type("This is a question")
        .blur();

      cy.wait("@updateQuestion");
      cy.wait("@cardQuery");
      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/added a description/i);
      cy.findByTestId("question-revert-button").click();
      cy.wait("@cardQuery");

      cy.findByRole("tab", { name: "History" }).click();
      cy.findByText(/reverted to an earlier version/i, {
        timeout: 10000,
      }).should("be.visible");
    });

    cy.findByLabelText("Close").click();
    H.tableInteractive().should("contain", "NL");
  });
});

describe("issues 11727, 14957, 15876", { tags: "@external" }, () => {
  const PG_DB_ID = 2;
  const PG_DB_NAME = "QA Postgres12";

  const cancelQuestionDetails = {
    dataset_query: {
      type: "native",
      database: PG_DB_ID,
      native: {
        query: "SELECT pg_sleep(10)",
      },
    },
  };

  const timeCastQuestionDetails: NativeQuestionDetails = {
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

  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should correctly cast to `TIME`, cancel the native query via the keyboard shortcut, and save a question before query has been executed (metabase#15876, metabase#11727, metabase#14957)", () => {
    H.createNativeQuestion(timeCastQuestionDetails, { visitQuestion: true });

    cy.findByTestId("query-visualization-root").within(() => {
      correctValues.forEach(({ value, rows }) => {
        const count = rows * castColumns;

        cy.findAllByText(value).should("have.length", count);
      });
    });

    cy.intercept("GET", "/api/database").as("getDatabases");
    cy.visit("/question#" + H.adhocQuestionHash(cancelQuestionDetails));
    cy.wait("@getDatabases");

    H.runNativeQuery({ wait: false });
    cy.findByTestId("query-builder-main")
      .findByText("Doing science...")
      .should("be.visible");
    cy.realPress([H.metaKey, "Enter"]);
    cy.findByTestId("query-builder-main")
      .findByText("Here's where your results will appear")
      .should("be.visible");

    H.startNewNativeQuestion();

    cy.findByTestId("gui-builder-data").click();
    cy.findByLabelText(PG_DB_NAME).click();
    H.NativeEditor.type("select pg_sleep(60)");
    H.saveQuestion("14957", undefined, {
      path: ["Our analytics"],
    });
    H.modal().should("not.exist");
  });
});

describe("issue 16584", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    H.startNewNativeQuestion();
    H.NativeEditor.type(
      "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
    ).type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    H.NativeEditor.selectAll();
    H.runNativeQuery();

    cy.findByTestId("query-visualization-root")
      .findByText("NL")
      .should("exist");
  });
});

describe("issue 33327", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should recover from a visualization error (metabase#33327)", () => {
    const query = "SELECT 1";
    H.createNativeQuestion(
      { native: { query }, display: "scalar" },
      {
        visitQuestion: true,
      },
    );

    cy.findByTestId("scalar-value").should("have.text", "1");

    cy.findByTestId("visibility-toggler").click();
    H.NativeEditor.get().should("contain", query);
    H.NativeEditor.type("{leftarrow}--");

    cy.intercept("POST", "/api/dataset").as("dataset");
    H.NativeEditor.get().should("be.visible").and("contain", "SELECT --1");
    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("visualization-root").within(() => {
      cy.icon("warning").should("be.visible");
      cy.findByTestId("scalar-value").should("not.exist");
    });

    H.NativeEditor.get().should("contain", "SELECT --1");
    H.NativeEditor.type("{leftarrow}{backspace}{backspace}");

    H.NativeEditor.get().should("contain", query);

    getRunQueryButton().click();
    cy.wait("@dataset");

    cy.findByTestId("scalar-value").should("have.text", "1");
    cy.findByTestId("visualization-root").icon("warning").should("not.exist");
  });
});

describe("issue 49454", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion({
      name: "Test Metric 49454",
      type: "metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
    H.createQuestion({
      name: "Test Question 49454",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    });
  });

  it("should be possible to use metrics in native queries (metabase#49454)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("select * from {{ #test");

    H.NativeEditor.completions().within(() => {
      H.NativeEditor.completion("-question-49454").should("be.visible");
      H.NativeEditor.completion("-metric-49454").should("be.visible");
    });
  });
});

describe("issue 48712", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should not reset the suggestions when the query is edited (metabase#48712)", () => {
    H.startNewNativeQuestion();

    H.NativeEditor.type("pro");
    H.NativeEditor.completion("PRODUCTS").should("be.visible");

    H.NativeEditor.type("{backspace}{backspace}{backspace}");
    H.NativeEditor.type("select * from pro");

    H.NativeEditor.completion("PRODUCTS").should("be.visible");

    H.NativeEditor.type("{nextcompletion}", { focus: false });
    H.NativeEditor.completion("PROCEDURE").should("have.attr", "aria-selected");

    // wait for all completions to finish
    cy.wait(1000);
    H.NativeEditor.completion("PROCEDURE").should("have.attr", "aria-selected");
  });
});

describe("issue 47793", { tags: ["@external", "@mongo"] }, () => {
  const MONGO_DB_ID = 2;

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

  it("should be possible to preview queries for mongodb (metabase#47793)", () => {
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
  });
});

describe("issue 53171", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: `Question ${"a".repeat(100)}`,
        query: { "source-table": ORDERS_ID },
      },
      {
        idAlias: "longNameQuestionId",
        wrapId: true,
      },
    );
  });

  it("title and icons in data reference sidebar should not overflow (metabase#53171)", () => {
    H.startNewNativeQuestion();

    cy.get("@longNameQuestionId").then((longNameQuestion) => {
      H.NativeEditor.type(`{{#${longNameQuestion}`);
    });

    cy.findByTestId("sidebar-content").within(($container) => {
      const [container] = $container;

      cy.findByTestId("sidebar-header").should(
        "contain.text",
        `Question ${"a".repeat(100)}`,
      );
      cy.findByTestId("sidebar-header").should(($header) => {
        const [header] = $header;
        const headerDescendants = header.querySelectorAll("*");

        headerDescendants.forEach((descendant) => {
          H.assertDescendantNotOverflowsContainer(descendant, container);
        });
      });

      verifyIconVisibleAndSized("chevronleft", 16);
      verifyIconVisibleAndSized("table", 16);
      verifyIconVisibleAndSized("close", 18);
    });
  });

  function verifyIconVisibleAndSized(iconName: IconName, size: number) {
    cy.icon(iconName)
      .should("be.visible")
      .and((icon) => {
        expect(icon.outerWidth()).to.equal(size);
        expect(icon.outerHeight()).to.equal(size);
      });
  }
});

describe("issue 54124", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createQuestion(
      {
        name: "Reference Question",
        query: { "source-table": ORDERS_ID },
      },
      {
        idAlias: "questionId",
        wrapId: true,
      },
    );
  });

  it("should be possible to close the data reference sidebar (metabase#54124)", () => {
    H.startNewNativeQuestion();

    cy.findByTestId("sidebar-content")
      .should("be.visible")
      .icon("close")
      .click();

    cy.get("@questionId").then((questionId) => {
      H.NativeEditor.type(`{{#${questionId}-reference-question }}`, {
        allowFastSet: true,
      });
    });
    H.NativeEditor.type("{leftarrow}{leftarrow}{leftarrow}");

    cy.findByTestId("sidebar-content")
      .should("be.visible")
      .icon("close")
      .click();

    cy.findByTestId("sidebar-content").should("not.exist");

    cy.log("moving cursor should open the reference sidebar again");
    H.NativeEditor.type("{leftarrow}{leftarrow}{leftarrow}");
    cy.findByTestId("sidebar-content").should("be.visible");
  });
});

describe("issue 52811", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("popovers should close when clicking outside (metabase#52811)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("{{x");
    cy.findByLabelText("Variable type").click();

    cy.log("popover should close when clicking away");
    H.popover().findByText("Field Filter").click();
    H.popover().should("be.visible").and("contain.text", "Orders");
    clickAway();
    cy.get(H.POPOVER_ELEMENT).should("not.exist");

    cy.log(
      "existing popover should close when opening a new one (metabase#52811)",
    );
    cy.findByTestId("sidebar-content").findByText("Select...").click();
    cy.findByLabelText("Variable type").click();
    H.popover()
      .should("have.length", 1)
      .and("contain.text", "Field Filter")
      .and("not.contain.text", "Sample Database");
  });

  function clickAway() {
    cy.get("body").click(0, 0);
  }
});

describe("issue 52806", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should remove parameter values from the URL when leaving the query builder and discarding changes (metabase#52806)", () => {
    cy.visit("/");
    H.newButton("SQL query").click();
    H.NativeEditor.focus().type("select {{x}}");
    cy.location().should((location) => expect(location.search).to.eq("?x="));
    cy.findByTestId("main-logo-link").click();
    H.modal().button("Discard changes").click();
    cy.findByTestId("home-page");
    cy.location().should((location) => expect(location.search).to.eq(""));
  });
});

describe("issues 55951, 57644", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("should open the database picker with multiple databases, without a loading state when databases are being reloaded (metabase#55951, metabase#57644)", () => {
    cy.log(
      "should open the database picker when opening the native query editor and there are multiple databases (metabase#57644)",
    );
    H.startNewNativeQuestion({
      database: null,
      query: "",
    });
    H.popover()
      .should("be.visible")
      .and("contain", "Sample Database")
      .and("contain", "QA Postgres12");

    cy.log(
      "should not show loading state in database picker when databases are being reloaded (metabase#55951)",
    );
    cy.intercept<unknown, ListDatabasesResponse>(
      "GET",
      "/api/database",
      (request) => {
        request.continue((response) => {
          response.body.data = mockResponseData(response.body.data);
        });
      },
    ).as("getDatabases");

    cy.visit("/");
    cy.wait("@getDatabases");

    cy.intercept<unknown, ListDatabasesResponse>(
      "GET",
      "/api/database*",
      (request) => {
        request.continue((response) => {
          response.body.data = mockResponseData(response.body.data);

          // Setting this to be arbitrarly long so that H.repeatAssertion is guaranteed to detect the issue
          return new Promise((resolve) => setTimeout(resolve, 2000));
        });
      },
    );

    H.newButton("SQL query").click();
    H.popover()
      .should("be.visible")
      .within(() => {
        cy.findByText("QA Postgres12").should("be.visible");
        cy.findByText("Sample Database").should("be.visible");

        H.repeatAssertion(() => {
          cy.findByTestId("loading-indicator", { timeout: 250 }).should(
            "not.exist",
          );
        });
      });
  });

  function mockResponseData(databases: Database[]) {
    return databases.map((database) => ({
      ...database,
      initial_sync_status: "incomplete" as const,
    }));
  }
});

describe("issue 54799", () => {
  const questionDetails = {
    native: {
      query: "select 'foo', 'bar'",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  function select(el: Cypress.Chainable, pos: Cypress.PositionType = "center") {
    el.dblclick(pos, H.holdMetaKey);
  }

  it("it should be possible to select multiple ranges and run those (metabase#54799)", () => {
    cy.findByTestId("visibility-toggler").click();

    cy.get("[data-testid=cell-data]").contains("foo").should("be.visible");
    cy.get("[data-testid=cell-data]").contains("bar").should("be.visible");

    select(H.NativeEditor.get().findByText("select"));
    select(H.NativeEditor.get().findByText("'foo'"));
    select(H.NativeEditor.get().findByText("'foo'"), "left");
    select(H.NativeEditor.get().findByText("'bar'"));
    select(H.NativeEditor.get().findByText("'bar'"), "right");

    getRunQueryButton().click();

    cy.get("[data-testid=cell-data]").contains(/^foo$/).should("not.exist");
    cy.get("[data-testid=cell-data]").contains(/^bar$/).should("not.exist");

    cy.get("[data-testid=cell-data]")
      .contains(/^'foobar'$/)
      .should("be.visible");
    cy.get("[data-testid=cell-data]")
      .contains(/foobar/)
      .should("be.visible");
  });
});

describe("issue 56570", () => {
  const questionDetails = {
    native: {
      query: `select '${"ab".repeat(200)}'`,
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.createNativeQuestion(questionDetails, { visitQuestion: true });
  });

  it("should not push the toolbar off-screen (metabase#56570)", () => {
    cy.findByTestId("visibility-toggler").click();
    cy.findByTestId("native-query-editor-action-buttons").should("be.visible");
  });
});

describe("issue 56905", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    H.startNewNativeQuestion();
  });

  it("It should be possible to run the native query when a parameter value input is focused (metabase#56905)", () => {
    H.NativeEditor.type("select {{ foo }}");
    cy.findByPlaceholderText("Foo").type("foobar", { delay: 0 });

    cy.realPress([H.metaKey, "Enter"]);

    cy.findByTestId("query-visualization-root")
      .findByText("foobar")
      .should("be.visible");
  });
});

describe("issue 59110", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow dragging border to completely hide native query editor (metabase#59110)", () => {
    H.startNewNativeQuestion();

    H.NativeEditor.get().should("be.visible");
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("not.exist");

    H.NativeEditor.get().then((editor) => {
      const { height } = editor[0].getBoundingClientRect();
      const diff = height + 20;

      cy.log("drag the border to hide the editor");

      cy.findByTestId("drag-handle").then((handle) => {
        const coordsDrag = handle[0].getBoundingClientRect();

        cy.wrap(handle)
          .trigger("mousedown", {
            clientX: coordsDrag.x,
            clientY: coordsDrag.y,
          })
          .trigger("mousemove", {
            clientX: coordsDrag.x,
            clientY: coordsDrag.y - diff,
          });
      });
    });

    H.NativeEditor.get().should("not.exist");
    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .should("be.visible")
      .click();

    cy.log("verify that editor height is restored");
    H.NativeEditor.get().then((editor) => {
      const { height } = editor[0].getBoundingClientRect();
      expect(height).to.be.greaterThan(100);
    });
  });
});

describe("issue 59356", { tags: "@external" }, () => {
  function typeRunShortcut() {
    cy.realPress([H.metaKey, "Enter"]);
  }

  function getLoader() {
    return H.queryBuilderMain().findByTestId("loading-indicator");
  }

  function getEmptyStateMessage() {
    return H.queryBuilderMain().findByText(
      "Here's where your results will appear",
    );
  }

  beforeEach(() => {
    H.restore("postgres-writable");
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should properly cancel the query via the keyboard shortcut (metabase#59356)", () => {
    cy.log("open the native query");
    H.startNewNativeQuestion({
      database: WRITABLE_DB_ID,
      query: "select pg_sleep(5000)",
    });

    cy.log("verify that the query is not running");
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 0);

    cy.log("run the query and verify that it is running");
    typeRunShortcut();
    getLoader().should("be.visible");
    getEmptyStateMessage().should("not.exist");
    cy.get("@dataset.all").should("have.length", 1);

    cy.log("cancel the query and verify that no new query is running");
    typeRunShortcut();
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 1);

    cy.log("run the query again and verify that it is running");
    typeRunShortcut();
    getLoader().should("be.visible");
    getEmptyStateMessage().should("not.exist");
    cy.get("@dataset.all").should("have.length", 2);

    cy.log("cancel the query and verify that no new query is running");
    typeRunShortcut();
    getLoader().should("not.exist");
    getEmptyStateMessage().should("be.visible");
    cy.get("@dataset.all").should("have.length", 2);
  });
});

describe("issue 63711", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("Completions should be visible when there are a lot of options (metabase#63711)", () => {
    H.startNewNativeQuestion();
    H.NativeEditor.type("s");

    cy.log("completions should be scrollable");
    H.NativeEditor.completions()
      .findByLabelText("Completions")
      .then(($el) => {
        const element = $el[0];
        cy.wrap(element.scrollHeight).should("be.gt", element.clientHeight);
      });

    cy.log("completions should not cut off the height of the inner element");
    H.NativeEditor.completion("SAVEPOINT")
      .should("be.visible")
      .then(($outerElement) => {
        cy.wrap($outerElement)
          .findByText("AVEPOINT")
          .should("be.visible")
          .then(($innerElement) => {
            cy.wrap($innerElement[0].offsetHeight).should(
              "be.eq",
              $outerElement[0].clientHeight,
            );
          });
      });
  });
});

describe("issue 66745", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("saveCard");
  });

  ["row", "bar"].forEach((vizType) => {
    it(`should not break visualization on native query column rename (metabase#66745) - ${vizType}`, () => {
      H.createNativeQuestion(
        {
          name: `66745 - ${vizType}`,
          native: {
            query:
              'SELECT \'Category 1\' AS CATEGORY_NAME, \'Category 2\' AS CATEGORY_NAME2, 100 AS "Total", 60 AS "Hello", 40 AS "World"',
          },
          display: vizType,
          visualization_settings: {
            "graph.dimensions": ["CATEGORY_NAME"],
            "graph.metrics": ["Total", "World"],
          },
        },
        {
          wrapId: true,
          visitQuestion: true,
        },
      );

      cy.findByTestId("query-builder-main")
        .findByText("Open Editor")
        .should("be.visible")
        .click();

      H.NativeEditor.focus().type('{backspace}2"');

      getRunQueryButton().click();
      cy.wait("@dataset");

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Total").should("be.visible");
        cy.findByText("World").should("not.exist");
      });

      cy.findByTestId("qb-header-action-panel").findByText("Save").click();

      H.modal().findByText("Save").click();

      cy.wait("@saveCard");

      cy.findByTestId("qb-header-action-panel")
        .findByText("Save")
        .should("not.exist");

      cy.intercept("GET", "/api/card/*").as("getCard");
      H.visitQuestion("@questionId");
      cy.wait("@getCard");

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("Total").should("be.visible");
        cy.findByText("World").should("not.exist");
      });
      // eslint-disable-next-line metabase/no-unscoped-text-selectors
      cy.findByText("Something’s gone wrong").should("not.exist");

      H.openVizSettingsSidebar();
      H.leftSidebar().within(() => {
        cy.findAllByPlaceholderText("Select a field").should("have.length", 2);
        cy.findAllByPlaceholderText("Select a field")
          .eq(1)
          .should("have.value", "Total");
      });
    });
  });
});

describe("issue 51717", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should open question info sidebar when variables sidebar is already open (metabase#51717)", () => {
    H.createNativeQuestion(
      {
        name: "42",
        native: { query: "select 42" },
      },
      { visitQuestion: true },
    );

    cy.findByTestId("visibility-toggler")
      .findByText(/open editor/i)
      .click();

    cy.log("Open variables sidebar");
    cy.findByTestId("native-query-editor-action-buttons")
      .should("be.visible")
      .findByLabelText("Variables")
      .click();
    cy.findByTestId("sidebar-right")
      .should("be.visible")
      .and("contain", "Variables and parameters");

    cy.log("Info sidebar is opened");
    H.openQuestionInfoSidesheet();
    cy.findByTestId("sidesheet")
      .as("infoSidebar")
      .should("be.visible")
      .and("contain", "Info");

    cy.log("Make sure info sidebar is interactive (on top of the stack)");
    cy.get("@infoSidebar").findByRole("tab", { name: "History" }).click();
    cy.get("@infoSidebar").should("contain", "You created this");
  });
});

describe("issue 59075", () => {
  const WINDOW_HEIGHT = 1000;
  const BUTTON_INDEX = 0;

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.startNewNativeQuestion();
    cy.viewport(1024, WINDOW_HEIGHT);
  });

  it("should not be possible to resize the native query editor too far (metabase#59075)", () => {
    cy.findByTestId("drag-handle").then((handle) => {
      const coordsDrag = handle[0].getBoundingClientRect();

      cy.wrap(handle)
        .trigger("mousedown", {
          button: BUTTON_INDEX,
          clientX: coordsDrag.x,
          clientY: coordsDrag.y,
          force: true,
        })
        // Drag to the bottom of the screen
        .trigger("mousemove", {
          button: BUTTON_INDEX,
          clientX: coordsDrag.x,
          clientY: WINDOW_HEIGHT + 10,
          force: true,
        })
        .trigger("mouseup");
    });

    H.NativeEditor.get().then((editor) => {
      const { bottom } = editor.get()[0].getBoundingClientRect();
      cy.wrap(bottom).should("be.lessThan", WINDOW_HEIGHT - 50);
    });
  });
});

describe("issue 69160", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    H.createSnippet({
      name: "A and B",
      content: "{{ a }} and {{ b }}",
    });
    H.startNewNativeQuestion();
    H.NativeEditor.type("{{ snippet: A and B }}", {
      allowFastSet: true,
    }).blur();
  });

  const options = {
    force: true,
    isPrimary: true,
    button: 0,
  };

  it("should be possible to reorder parameters when there are snippets in the query (metabase#69160)", () => {
    cy.log("reorder parameters");
    cy.findByTestId("native-query-top-bar")
      .findAllByRole("listitem")
      .first()
      .as("param");

    cy.get("@param").trigger("mousedown", 5, 5, options).wait(200);
    cy.get("@param").trigger("mousemove", 20, 20, options).wait(200);
    cy.get("@param").trigger("mousemove", 200, 0, options).wait(200);
    cy.get("@param").trigger("mouseup", options).wait(200);

    cy.findByTestId("native-query-top-bar")
      .findAllByRole("textbox")
      .first()
      .should("have.attr", "placeholder", "B");
  });
});

describe("issue 64293", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should be possible to run a query for a empty required parameter without a default value (metabase#64293)", () => {
    const questionDetails: NativeQuestionDetails = {
      name: "Question 1",
      native: {
        query: "SELECT * FROM PEOPLE WHERE state = {{State}}",
        "template-tags": {
          State: {
            type: "text",
            name: "State",
            id: "1",
            "display-name": "State",
          },
        },
      },
      parameters: [
        createMockParameter({
          id: "1",
          slug: "State",
          required: true,
          name: "State",
        }),
      ],
    };

    H.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByPlaceholderText("State").should("exist");
    cy.findByPlaceholderText("State").type("NY{enter}");

    H.runButtonOverlay().should("exist");
    H.runButtonOverlay().click();

    H.ensureParameterColumnValue({
      columnName: "STATE",
      columnValue: "NY",
    });
  });
});

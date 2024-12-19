import { H } from "e2e/support";
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  getRunQueryButton,
  runQuery,
} from "../native-filters/helpers/e2e-sql-filter-helpers";

const { PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

// cy.realType does not have an option to not parse special characters
const LEFT_BRACKET = "{{}";
const DOUBLE_LEFT_BRACKET = `${LEFT_BRACKET}${LEFT_BRACKET}`;

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
    cy.findByTestId("viz-settings-button").click();

    H.sidebar().contains("X-axis");
    H.sidebar().contains("Y-axis");
  });
});

describe("issue 15029", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should allow dots in the variable reference (metabase#15029)", () => {
    H.openNativeEditor();
    cy.realType(
      `select * from products where RATING = ${DOUBLE_LEFT_BRACKET}number.of.stars}}`,
      {
        parseSpecialCharSequences: false,
      },
    );

    cy.findAllByText("Variable name").parent().findByText("number.of.stars");
  });
});

describe("issue 16886", () => {
  const ORIGINAL_QUERY = "select 1 from orders";
  const SELECTED_TEXT = "select 1";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("shouldn't remove parts of the query when choosing 'Run selected text' (metabase#16886)", () => {
    H.openNativeEditor();
    cy.realType(ORIGINAL_QUERY);
    cy.realPress("Home");
    Cypress._.range(SELECTED_TEXT.length).forEach(() =>
      cy.realPress(["Shift", "ArrowRight"]),
    );

    cy.findByTestId("native-query-editor-container").icon("play").click();

    cy.findByTestId("scalar-value").invoke("text").should("eq", "1");

    cy.get("@editor").contains(ORIGINAL_QUERY);
  });
});

describe("issue 16914", () => {
  beforeEach(() => {
    H.restore();
    cy.intercept("POST", "api/dataset").as("dataset");
    cy.signInAsAdmin();
  });

  it("should recover visualization settings after a failed query (metabase#16914)", () => {
    const FAILING_PIECE = " foo";

    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT 'a' as hidden, 'b' as visible",
        },
      },
      visualization_settings: {},
    });

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left")
      .contains(/hidden/i)
      .siblings("[data-testid$=hide-button]")
      .click();
    cy.button("Done").click();

    H.focusNativeEditor();
    cy.realType(FAILING_PIECE);
    H.runNativeQuery();

    H.focusNativeEditor();
    cy.realPress("End");
    Cypress._.range(FAILING_PIECE.length).forEach(() =>
      cy.realPress(["Shift", "ArrowLeft"]),
    );
    cy.realPress("Backspace");
    H.runNativeQuery();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("Every field is hidden right now").should("not.exist");
      cy.findByText("VISIBLE");
      cy.findByText("HIDDEN").should("not.exist");
    });
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

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      rearrangeColumns();
    });
  });

  it("should not render duplicated columns (metabase#17060)", () => {
    H.focusNativeEditor();
    cy.realPress("Home");
    Cypress._.range(SECTION.length).forEach(() => cy.realPress("ArrowRight"));
    Cypress._.range(SELECTED_TEXT.length).forEach(() =>
      cy.realPress(["Shift", "ArrowRight"]),
    );
    cy.realType("RATING");
    runQuery();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("num");
    });
  });
});

describe("issue 18148", () => {
  const dbName = "sqlite";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.addSQLiteDatabase({
      name: dbName,
    });
  });

  it("should not offer to save the question before it is actually possible to save it (metabase#18148)", () => {
    cy.visit("/");
    cy.findByTestId("app-bar").findByLabelText("New").click();
    H.popover().findByText("SQL query").click();

    cy.findByTestId("qb-save-button").should(
      "have.attr",
      "aria-disabled",
      "true",
    );

    cy.findByTestId("gui-builder-data").should("contain", "Select a database");
    H.popover().should("contain", "Sample Database").and("contain", dbName);
    H.popover().findByText(dbName).click();

    H.focusNativeEditor().realType("select foo");

    cy.findByTestId("qb-save-button").click();
    cy.findByTestId("save-question-modal").findByText("Save").should("exist");
  });
});

describe("issue 18418", () => {
  const questionDetails = {
    name: "REVIEWS SQL",
    native: { query: "select REVIEWER from REVIEWS LIMIT 1" },
  };

  beforeEach(() => {
    cy.intercept("POST", "/api/card").as("cardCreated");

    H.restore();
    cy.signInAsAdmin();
  });

  it("should not show saved questions DB in native question's DB picker (metabase#18418)", () => {
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Explore results").click();

    H.saveQuestion(undefined, undefined, {
      tab: "Browse",
      path: ["Our analytics"],
    });

    H.openNativeEditor({ fromCurrentPage: true });

    // Clicking native question's database picker usually opens a popover with a list of databases
    // As default Cypress environment has only the sample database available, we expect no popup to appear
    cy.get(H.POPOVER_ELEMENT).should("not.exist");
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

    cy.createNativeQuestion(question, { visitQuestion: true });
  });

  it("question field filter shows all tables from a selected database (metabase#19451)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Open Editor").click();
    cy.icon("variable").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products").click();
    cy.icon("chevronleft").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Products");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Orders");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("People");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Reviews");
  });
});

describe("issue 20044", () => {
  const questionDetails = {
    name: "20044",
    native: {
      query: "select 1",
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("nodata user should not see 'Explore results' (metabase#20044)", () => {
    cy.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
      cy.signIn("nodata");

      H.visitQuestion(id);

      cy.get("[data-testid=cell-data]").contains("1");
      cy.findByText("Explore results").should("not.exist");
    });
  });
});

describe("issue 20625", { tags: "@quarantine" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.updateSetting("native-query-autocomplete-match-style", "prefix");
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/database/*/autocomplete_suggestions**").as(
      "autocomplete",
    );
  });

  // realpress messes with cypress 13
  it("should continue to request more prefix matches (metabase#20625)", () => {
    H.openNativeEditor();
    cy.realType("s");

    // autocomplete_suggestions?prefix=s
    cy.wait("@autocomplete");

    // can't use cy.type because it does not simulate the bug
    cy.realPress("o");

    // autocomplete_suggestions?prefix=so
    cy.wait("@autocomplete");
  });
});

describe("issue 21034", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.openNativeEditor();
    cy.intercept(
      "GET",
      "/api/database/**/autocomplete_suggestions?**",
      cy.spy().as("suggestions"),
    );
  });

  it("should not invoke API calls for autocomplete twice in a row (metabase#18148)", () => {
    H.focusNativeEditor();
    cy.realType("p");

    // Wait until another explicit autocomplete is triggered
    // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
    // See https://github.com/metabase/metabase/pull/20970
    cy.wait(1000);

    cy.get("@suggestions").its("callCount").should("equal", 1);
  });
});

describe("issue 21550", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/collection/root/items?**").as("rootCollection");
    cy.intercept("GET", "/api/native-query-snippet/**").as("snippet");
  });

  it("should not show scrollbars for very short snippet (metabase#21550)", () => {
    H.openNativeEditor();

    cy.icon("snippet").click();
    cy.wait("@rootCollection");
    cy.findByTestId("sidebar-content").findByText("Create a snippet").click();

    H.modal().within(() => {
      cy.findByLabelText("Enter some SQL here so you can reuse it later").type(
        "select * from people",
      );
      cy.findByLabelText("Give your snippet a name").type("people");
      cy.findByText("Save").click();
      cy.wait("@rootCollection");
    });

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("people").realHover();
      cy.icon("chevrondown").click({ force: true });
    });

    cy.get("pre").then($pre => {
      const preWidth = $pre[0].getBoundingClientRect().width;
      const clientWidth = $pre[0].clientWidth;
      const BORDERS = 2; // 1px left and right
      expect(clientWidth).to.be.gte(preWidth - BORDERS);
    });
  });
});

describe("issue 21597", { tags: "@external" }, () => {
  const databaseName = "Sample Database";
  const databaseCopyName = `${databaseName} copy`;
  const secondDatabaseId = SAMPLE_DB_ID + 1;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("display the relevant error message in save question modal (metabase#21597)", () => {
    cy.intercept("POST", "/api/card").as("saveNativeQuestion");

    // Second DB (copy)
    H.addPostgresDatabase(databaseCopyName);

    // Create a native query and run it
    H.openNativeEditor({
      databaseName,
    });
    cy.realType(
      `SELECT COUNT(*) FROM PRODUCTS WHERE ${DOUBLE_LEFT_BRACKET}FILTER}}`,
    );

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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("200");

    // Change DB
    // and re-run the native query
    cy.findByTestId("native-query-editor-container")
      .findByText("Sample Database")
      .click();
    H.popover().within(() => {
      cy.findByText(databaseCopyName).click();
    });
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains(`Can\'t find field with ID: ${PRODUCTS.CATEGORY}`);

    // Try to save the native query
    cy.findByTestId("qb-header-action-panel").findByText("Save").click();
    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByPlaceholderText("What is the name of your question?").type("Q");
      cy.findByText("Save").click();
      cy.wait("@saveNativeQuestion");
      cy.findByText(
        `Invalid Field Filter: Field ${PRODUCTS.CATEGORY} "PRODUCTS"."CATEGORY" belongs to Database ${SAMPLE_DB_ID} "${databaseName}", but the query is against Database ${secondDatabaseId} "${databaseCopyName}"`,
      );
    });
  });
});

describe("issue 23510", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("loads metadata when it is not cached (metabase#23510)", () => {
    cy.createNativeQuestion(
      {
        database: 1,
        name: "Q23510",
        native: {
          query:
            "select count(*) from orders left join products on products.id=orders.product_id where {{category}}",
          "template-tags": {
            ID: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              name: "Category",
              display_name: "Category",
              type: "dimension",
              dimension: ["field", PRODUCTS.CATEGORY, null],
              "widget-type": "category",
              default: null,
            },
          },
        },
        display: "scalar",
      },
      { visitQuestion: true },
    );

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Open Editor").click();
    cy.icon("reference").click();

    cy.findByTestId("sidebar-content").within(() => {
      cy.findByText("ORDERS");
      cy.findByText("PRODUCTS");
      cy.findByText("REVIEWS");
      cy.findByText("PEOPLE");
      cy.findByText("Sample Database");
    });
  });
});

describe("issue 30680", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should not render native editor buttons when 'Metadata' tab is open (metabase#30680)", () => {
    H.startNewNativeModel({ query: "select 1" });
    cy.findByTestId("editor-tabs-metadata").should("be.disabled");

    H.runNativeQuery();
    cy.findByTestId("editor-tabs-metadata").should("not.be.disabled");
    cy.findByTestId("editor-tabs-metadata-name").click();

    cy.findByTestId("sidebar-content").should("exist");
    cy.findByTestId("native-query-editor-sidebar").should("not.exist");
  });
});

describe("issue 34330", { tags: "@flaky" }, () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("GET", "/api/database/*/autocomplete_suggestions**").as(
      "autocomplete",
    );
  });

  it("should only call the autocompleter with all text typed (metabase#34330)", () => {
    H.openNativeEditor();
    cy.realType("USER");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("USER");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter eventually, even when only 1 character was typed (metabase#34330)", () => {
    H.openNativeEditor();
    cy.realType("U");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("U");
    });

    // only one call to the autocompleter should have been made
    cy.get("@autocomplete.all").should("have.length", 1);
  });

  it("should call the autocompleter when backspacing to a 1-character prefix(metabase#34330)", () => {
    H.openNativeEditor();
    cy.realType("SE{backspace}");

    cy.wait("@autocomplete").then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("substring")).to.equal("S");
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
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.findByTestId("query-builder-main").findByText("Open Editor").click();

    // make sure normal undo still works
    H.focusNativeEditor();
    cy.realType("--");
    expect(H.focusNativeEditor().findByText("--")).to.exist;

    H.focusNativeEditor();
    cy.realPress(["Meta", "z"]);
    H.focusNativeEditor().findByText("--").should("not.exist");

    // more undoing does not change to empty editor
    H.focusNativeEditor();
    cy.realPress(["Meta", "z"]);
    expect(H.focusNativeEditor().findByText("select")).to.exist;
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
          default: "2022-10-02",
          required: true,
        },
      },
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();

    cy.createNativeQuestion(questionDetails, { visitQuestion: true });

    cy.intercept("GET", "/api/search?*").as("getSearchResults");
  });

  it("should not redirect to the value of 'from' URL parameter after saving (metabase#35785)", () => {
    cy.findByTestId("native-query-editor-container")
      .findByTestId("visibility-toggler")
      .click();
    H.focusNativeEditor();
    cy.realType("{backspace}4");

    cy.findByTestId("qb-header").findByRole("button", { name: "Save" }).click();

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click();
    });

    cy.wait("@getSearchResults");

    cy.url().should("include", "/question");
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

    cy.createCollection({ name: "Restricted Collection" }).then(
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

    H.openNativeEditor();
    cy.get("@questionId").then(questionId => {
      // can't use cy.type because it does not simulate the bug
      cy.realType(`select * from ${DOUBLE_LEFT_BRACKET}#${questionId}`);
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
    cy.createNativeQuestion(questionDetails, { visitQuestion: true });
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

const { H } = cy;
import { SAMPLE_DB_ID, USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  getRunQueryButton,
  runQuery,
} from "../native-filters/helpers/e2e-sql-filter-helpers";

const { PRODUCTS, ORDERS_ID } = SAMPLE_DATABASE;

describe("native reproductions", () => {
  before(() => {
    H.restore();
  });

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

  describe("issue 15029", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should allow dots in the variable reference (metabase#15029)", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.type(
        "select * from products where RATING = {{number.of.stars}}",
      );

      cy.findAllByText("Variable name").parent().findByText("number.of.stars");
    });
  });

  describe("issue 16886", () => {
    const ORIGINAL_QUERY = "select 1 from orders";
    const SELECTED_TEXT = "select 1";

    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("shouldn't remove parts of the query when choosing 'Run selected text' (metabase#16886)", () => {
      H.startNewNativeQuestion();
      H.NativeEditor.type(ORIGINAL_QUERY);
      cy.realPress("Home");
      Cypress._.range(SELECTED_TEXT.length).forEach(() =>
        cy.realPress(["Shift", "ArrowRight"]),
      );

      cy.findByTestId("native-query-editor-container").icon("play").click();

      cy.findByTestId("scalar-value").invoke("text").should("eq", "1");

      H.NativeEditor.get().contains(ORIGINAL_QUERY);
    });
  });

  describe("issue 16914", () => {
    beforeEach(() => {
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

      H.openVizSettingsSidebar();
      cy.findByTestId("sidebar-left")
        .as("sidebar")
        .within(() => {
          cy.findByTestId("draggable-item-HIDDEN")
            .icon("eye_outline")
            .click({ force: true });
        });
      cy.button("Done").click();

      H.NativeEditor.focus().type(FAILING_PIECE);
      H.runNativeQuery();

      H.NativeEditor.focus();
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

      cy.findByTestId("query-visualization-root").within(() => {
        cy.findByText("num");
      });
    });
  });

  describe("issue 18148", () => {
    const dbName = "sqlite";

    beforeEach(() => {
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

      H.NativeEditor.focus().type("select foo");

      cy.findByTestId("qb-save-button").click();
      cy.findByTestId("save-question-modal").findByText("Save").should("exist");
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
      cy.signInAsAdmin();

      H.createNativeQuestion(question, { visitQuestion: true });
    });

    it("question field filter shows all tables from a selected database (metabase#19451)", () => {
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open Editor").click();
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

  describe("issue 20044", () => {
    const questionDetails = {
      name: "20044",
      native: {
        query: "select 1",
      },
    };

    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("nodata user should not see 'Explore results' (metabase#20044)", () => {
      H.createNativeQuestion(questionDetails).then(({ body: { id } }) => {
        cy.signIn("nodata");

        H.visitQuestion(id);

        cy.get("[data-testid=cell-data]").contains("1");
        cy.findByText("Explore results").should("not.exist");
      });
    });
  });

  describe("issue 20625", { tags: "@skip" }, () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.updateSetting("native-query-autocomplete-match-style", "prefix");
      cy.signInAsNormalUser();
    });

    // realpress messes with cypress 13
    it("should continue to request more prefix matches from the server when the limit was hit (metabase#20625)", () => {
      cy.intercept("GET", "/api/database/*/autocomplete_suggestions**", {
        statusCode: 200,
        body: [
          // This result has 50 items, which is the limit
          // as set by the backend.
          // This is needed to trigger the second autocomplete.
          ["ORDERS", "Table"],
          ["PEOPLE", "Table"],
          ["REVIEWS", "Table"],
          ["ACTIVE_SUBSCRIPTION", "ACCOUNTS :type/Boolean :type/Category"],
          ["ADDRESS", "PEOPLE :type/Text"],
          ["BIRTH_DATE", "PEOPLE :type/Date"],
          ["BUTTON_LABEL", "ANALYTIC_EVENTS :type/Text :type/Category"],
          ["CANCELED_AT", "ACCOUNTS :type/DateTime :type/CancelationTimestamp"],
          ["CATEGORY", "PRODUCTS :type/Text :type/Category"],
          ["CREATED_AT", "ACCOUNTS :type/DateTime :type/CreationTimestamp"],
          ["CREATED_AT", "ORDERS :type/DateTime :type/CreationTimestamp"],
          ["CREATED_AT", "PEOPLE :type/DateTime :type/CreationTimestamp"],
          ["CREATED_AT", "PRODUCTS :type/DateTime :type/CreationTimestamp"],
          ["CREATED_AT", "REVIEWS :type/DateTime :type/CreationTimestamp"],
          ["DATE_RECEIVED", "FEEDBACK :type/DateTime"],
          ["DATE_RECEIVED", "INVOICES :type/DateTime"],
          ["EAN", "PRODUCTS :type/Text"],
          ["EMAIL", "ACCOUNTS :type/Text :type/Email"],
          ["EMAIL", "FEEDBACK :type/Text :type/Email"],
          ["EMAIL", "PEOPLE :type/Text :type/Email"],
          ["EVENT", "ANALYTIC_EVENTS :type/Text :type/Category"],
          ["EXPECTED_INVOICE", "INVOICES :type/Boolean :type/Category"],
          ["FIRST_NAME", "ACCOUNTS :type/Text :type/Name"],
          ["LAST_NAME", "ACCOUNTS :type/Text :type/Name"],
          ["LATITUDE", "ACCOUNTS :type/Float :type/Latitude"],
          ["LATITUDE", "PEOPLE :type/Float :type/Latitude"],
          ["LEGACY_PLAN", "ACCOUNTS :type/Boolean :type/Category"],
          ["LONGITUDE", "ACCOUNTS :type/Float :type/Longitude"],
          ["LONGITUDE", "PEOPLE :type/Float :type/Longitude"],
          ["NAME", "PEOPLE :type/Text :type/Name"],
          ["PAGE_URL", "ANALYTIC_EVENTS :type/Text :type/URL"],
          ["PAYMENT", "INVOICES :type/Float"],
          ["PRICE", "PRODUCTS :type/Float"],
          ["RATING_MAPPED", "FEEDBACK :type/Text :type/Category"],
          ["REVIEWER", "REVIEWS :type/Text"],
          ["SEATS", "ACCOUNTS :type/Integer"],
          ["SOURCE", "ACCOUNTS :type/Text :type/Source"],
          ["SOURCE", "PEOPLE :type/Text :type/Source"],
          ["STATE", "PEOPLE :type/Text :type/State"],
          ["TIMESTAMP", "ANALYTIC_EVENTS :type/DateTime"],
          ["TITLE", "PRODUCTS :type/Text :type/Title"],
          ["TRIAL_CONVERTED", "ACCOUNTS :type/Boolean :type/Category"],
          ["TRIAL_ENDS_AT", "ACCOUNTS :type/DateTime"],
          ["USER_ID", "ORDERS :type/Integer :type/FK"],
          ["VENDOR", "PRODUCTS :type/Text :type/Company"],
          ["VENDOR_ID", "PRODUCTS :type/Integer :type/FK"],
          ["USER_NAME", "PRODUCTS :type/Text :type/Name"],
          ["TEST_COLUMN_1", "PRODUCTS :type/Text :type/Name"],
          ["TEST_COLUMN_2", "PRODUCTS :type/Text :type/Name"],
          ["TEST_COLUMN_3", "PRODUCTS :type/Text :type/Name"],
        ],
      }).as("autocomplete");

      H.startNewNativeQuestion();
      H.NativeEditor.type("e");

      // autocomplete_suggestions?prefix=s
      cy.wait("@autocomplete");

      H.NativeEditor.type("o");

      // autocomplete_suggestions?prefix=so
      cy.wait("@autocomplete");
    });

    it("should not continue to request more prefix matches from the server when the limit was not hit (metabase#20625)", () => {
      cy.intercept("GET", "/api/database/*/autocomplete_suggestions**", {
        statusCode: 200,
        body: [
          // This result has less than 50 items, which is under the limit
          // as set by the backend.
          // It will not be necessary to trigger the second autocomplete.
          ["ORDERS", "Table"],
          ["PEOPLE", "Table"],
          ["REVIEWS", "Table"],
          ["ACTIVE_SUBSCRIPTION", "ACCOUNTS :type/Boolean :type/Category"],
          ["ADDRESS", "PEOPLE :type/Text"],
        ],
      }).as("autocomplete");

      H.startNewNativeQuestion();
      H.NativeEditor.type("e");

      // autocomplete_suggestions?prefix=s
      cy.wait("@autocomplete");

      H.NativeEditor.type("o");

      cy.get("@autocomplete.all").should("have.length", 1);
    });
  });

  describe("issue 21034", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.startNewNativeQuestion();
      cy.intercept(
        "GET",
        "/api/database/**/autocomplete_suggestions?**",
        cy.spy().as("suggestions"),
      );
    });

    it("should not invoke API calls for autocomplete twice in a row (metabase#18148)", () => {
      H.NativeEditor.type("p");

      // Wait until another explicit autocomplete is triggered
      // (slightly longer than AUTOCOMPLETE_DEBOUNCE_DURATION)
      // See https://github.com/metabase/metabase/pull/20970
      cy.wait(1000);

      cy.get("@suggestions").its("callCount").should("equal", 1);
    });
  });

  describe("issue 21550", () => {
    beforeEach(() => {
      cy.signInAsAdmin();

      cy.intercept("GET", "/api/collection/root/items?**").as("rootCollection");
      cy.intercept("GET", "/api/native-query-snippet/**").as("snippet");
    });

    it("should not show scrollbars for very short snippet (metabase#21550)", () => {
      H.startNewNativeQuestion();

      cy.icon("snippet").click();
      cy.wait("@rootCollection");
      cy.findByTestId("sidebar-content").findByText("Create snippet").click();

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

      cy.get("pre").then(($pre) => {
        const preWidth = $pre[0].getBoundingClientRect().width;
        const clientWidth = $pre[0].clientWidth;
        const BORDERS = 2; // 1px left and right
        expect(clientWidth).to.be.gte(preWidth - BORDERS);
      });
    });
  });

  describe("issue 31926", { tags: "@external" }, () => {
    const databaseName = "Sample Database";
    const databaseCopyName = `${databaseName} copy`;

    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("display the relevant error message in save question modal (metabase#21597)", () => {
      cy.intercept({ method: "POST", url: "/api/card" });

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
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.contains("200");

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

  describe("issue 21597", { tags: "@external" }, () => {
    /*
     *
     * Greetings and welcome to this weird test. It has a history! A long legacy! Allow me to explain:
     *
     * This test was originally using changing the DB on a native query with field filters to trigger an error that
     * would show up in the save modal.
     *
     * PR#54453 fixes this error by removing the field filters that refer to the old database, which means that it won't
     * save.
     *
     * So in order to trigger an error, we are intercepting the POST /api/card and manually responding with an error.
     *
     * We then assert that the message makes it to the save modal.
     *
     * The End
     */
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("display the relevant error message in save question modal (metabase#21597)", () => {
      const message =
        'Invalid Field Filter: Field 164574 "PRODUCTS"."CATEGORY" belongs to Database 2276 "sample-dataset", but the query is against Database 2275 "test-data"';
      cy.intercept({ method: "POST", url: "/api/card" }, (request) => {
        request.reply({
          body: {
            message: message,
            _status: 400,
          },
          statusCode: 400,
        });
      }).as("saveNativeQuestion");

      // Create a native query and run it
      H.startNewNativeQuestion();
      H.NativeEditor.type("SELECT 1");

      // Try to save the native query
      cy.findByTestId("qb-header-action-panel").findByText("Save").click();
      H.modal().within(() => {
        cy.findByPlaceholderText("What is the name of your question?").type(
          "The question name",
        );
        cy.findByText("Save").click();
        cy.wait("@saveNativeQuestion");
        cy.findByText(message);
      });
    });
  });

  describe("issue 23510", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("loads metadata when it is not cached (metabase#23510)", () => {
      H.createNativeQuestion(
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

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Open Editor").click();

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
      cy.signInAsAdmin();
    });

    it("should not render native editor buttons when 'Columns' tab is open (metabase#30680)", () => {
      H.startNewNativeModel({ query: "select 1" });
      cy.findByTestId("editor-tabs-columns").should("be.disabled");

      H.runNativeQuery();
      cy.findByTestId("editor-tabs-columns").should("not.be.disabled");
      cy.findByTestId("editor-tabs-columns-name").click();

      cy.findByTestId("sidebar-content").should("exist");
      cy.findByTestId("native-query-editor-action-buttons").should("not.exist");
    });
  });

  describe("issue 34330", () => {
    beforeEach(() => {
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

    it("should call the autocompleter eventually, even when only 1 character was typed (metabase#34330)", () => {
      H.NativeEditor.type("S", { delay: 10 });
      H.NativeEditor.completion("SEATS").should("be.visible");

      cy.wait("@autocomplete").then(({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("substring")).to.equal("S");
      });

      // only one call to the autocompleter should have been made
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
      cy.signInAsNormalUser();
    });

    it("should not allow the user to undo to the empty editor (metabase#35344)", () => {
      H.createNativeQuestion(questionDetails, { visitQuestion: true });

      cy.findByTestId("query-builder-main").findByText("Open Editor").click();

      // make sure normal undo still works
      H.NativeEditor.type("--");
      expect(H.NativeEditor.get().findByText("--")).to.exist;

      H.NativeEditor.focus();
      cy.realPress(["Meta", "z"]);
      H.NativeEditor.get().findByText("--").should("not.exist");

      // more undoing does not change to empty editor
      H.NativeEditor.focus();
      cy.realPress(["Meta", "z"]);
      expect(H.NativeEditor.get().findByText("select")).to.exist;
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
      cy.signInAsNormalUser();

      H.createNativeQuestion(questionDetails, { visitQuestion: true });

      cy.intercept("GET", "/api/search?*").as("getSearchResults");
    });

    it("should not redirect to the value of 'from' URL parameter after saving (metabase#35785)", () => {
      cy.findByTestId("native-query-editor-container")
        .findByTestId("visibility-toggler")
        .click();
      H.NativeEditor.type("{backspace}4");

      cy.findByTestId("qb-header").findByRole("button", { name: "Save" }).click();

      cy.findByTestId("save-question-modal").within((modal) => {
        cy.findByText("Save").click();
      });

      cy.wait("@getSearchResults");

      cy.url().should("include", "/question");
    });
  });

  describe("issue 22991", () => {
    beforeEach(() => {
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
        H.NativeEditor.type(`select * from {{${questionId}}}`);
      });

      cy.get("main").should(
        "not.contain",
        "Sorry, you don't have permission to see that",
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
});

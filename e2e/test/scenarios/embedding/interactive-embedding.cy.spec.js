const { H } = cy;
import { USERS, USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { uuid } from "metabase/lib/uuid";
import {
  createMockDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;

describe("scenarios > embedding > full app", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("POST", "/api/card/*/query").as("getCardQuery");
    cy.intercept("POST", "/api/dashboard/**/query").as("getDashCardQuery");
    cy.intercept("GET", "/api/dashboard/*").as("getDashboard");
    cy.intercept("GET", "/api/automagic-dashboards/**").as("getXrayDashboard");
  });

  describe("home page navigation", () => {
    it("should show the top and side nav by default", () => {
      H.visitFullAppEmbeddingUrl({ url: "/" });
      cy.wait("@getXrayDashboard");

      H.appBar()
        .should("be.visible")
        .within(() => {
          cy.findByTestId("main-logo").should("be.visible");
          cy.button(/New/).should("not.exist");
          cy.findByPlaceholderText("Search").should("not.exist");
        });

      sideNav().should("be.visible");
    });

    it("should hide the top nav when nothing is shown", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: { side_nav: false, logo: false },
      });
      cy.wait("@getXrayDashboard");
      H.appBar().should("not.exist");
    });

    it("should hide the top nav by an explicit param", () => {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { top_nav: false } });
      cy.wait("@getXrayDashboard");
      H.appBar().should("not.exist");
    });

    it("should not hide the top nav when the logo is still visible", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { breadcrumbs: false },
      });
      cy.wait("@getCardQuery");

      H.appBar().within(() => {
        cy.findByTestId("main-logo").should("be.visible");
        cy.findByRole("treeitem", { name: "Our analytics" }).should(
          "not.exist",
        );
      });
    });

    it("should keep showing sidebar toggle button when logo, breadcrumbs, the new button, and search are hidden", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: {
          logo: false,
          breadcrumbs: false,
          search: false,
          new_button: false,
        },
      });
      cy.wait("@getXrayDashboard");

      sideNav().should("be.visible");
      H.appBar()
        .should("be.visible")
        .within(() => {
          cy.button("Toggle sidebar").should("be.visible").click();
        });
      sideNav().should("not.be.visible");
    });

    it("should hide the side nav by a param", () => {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { side_nav: false } });
      H.appBar().within(() => {
        cy.findByTestId("main-logo").should("be.visible");
        cy.button("Toggle sidebar").should("not.exist");
      });
      sideNav().should("not.exist");
    });

    it("should disable home link when top nav is enabled but side nav is disabled", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { top_nav: true, side_nav: false },
      });
      cy.findByTestId("main-logo-link").should(
        "have.attr",
        "disabled",
        "disabled",
      );
    });

    it("should show question creation controls by a param", () => {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { new_button: true } });
      H.appBar().within(() => {
        cy.button(/New/).should("be.visible");
      });
    });

    it("should show search controls by a param", () => {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { search: true } });
      H.appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });

    it("should preserve params when navigating", () => {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { search: true } });

      H.appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });

      sideNav().findByText("Our analytics").click();

      cy.findAllByRole("rowgroup")
        .should("contain", "Orders in a dashboard")
        .and("be.visible");

      H.appBar().within(() => {
        cy.findByPlaceholderText("Search…").should("be.visible");
      });
    });
  });

  describe("browse data", () => {
    it("should hide the top nav when nothing is shown", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/browse/databases",
        qs: { side_nav: false, logo: false },
      });
      cy.findByRole("heading", { name: /Databases/ }).should("be.visible");
      cy.findByRole("treeitem", { name: /Browse databases/ }).should(
        "not.exist",
      );
      cy.findByRole("treeitem", { name: "Our analytics" }).should("not.exist");
      H.appBar().should("not.exist");
    });
  });

  describe("questions", () => {
    it("should show the question header by default", () => {
      visitQuestionUrl({ url: "/question/" + ORDERS_QUESTION_ID });

      cy.findByTestId("qb-header").should("be.visible");
      cy.findByTestId("qb-header-left-side").realHover();
      cy.button(/Edited/).should("be.visible");

      cy.icon("refresh").should("be.visible");
      cy.findByTestId("notebook-button").should("be.visible");
      cy.findByTestId("qb-header")
        .button(/Summarize/)
        .should("be.visible");
      cy.findByTestId("qb-header")
        .button(/Filter/)
        .should("be.visible");
    });

    it("should hide the question header by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { header: false },
      });

      cy.findByTestId("qb-header").should("not.exist");
    });

    it("should hide the question's additional info by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { additional_info: false },
      });

      cy.findByTestId("app-bar")
        .findByText("Our analytics")
        .should("be.visible");
      cy.findByTestId("qb-header")
        .findByText(/Edited/)
        .should("not.exist");
    });

    it("should hide the question's action buttons by a param", () => {
      visitQuestionUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      cy.icon("refresh").should("be.visible");
      cy.findByTestId("notebook-button").should("not.exist");
      cy.button(/Summarize/).should("not.exist");
      cy.button(/Filter/).should("not.exist");
    });

    it("should send 'X-Metabase-Client' header for api requests", () => {
      H.visitFullAppEmbeddingUrl({
        url: "/question/" + ORDERS_QUESTION_ID,
        qs: { action_buttons: false },
      });

      cy.wait("@getCardQuery").then(({ request }) => {
        expect(request?.headers?.["x-metabase-client"]).to.equal(
          "embedding-iframe",
        );
      });
    });

    describe("question creation", () => {
      beforeEach(() => {
        cy.signOut();
        cy.signInAsNormalUser();
      });

      it("should allow to create a new question from the navbar (metabase#21511)", () => {
        // Simple data picker
        H.visitFullAppEmbeddingUrl({
          url: "/collection/root",
          qs: { top_nav: true, new_button: true, side_nav: false },
        });

        cy.button("New").click();
        H.popover().findByText("Question").click();
        H.popover().findByText("Orders").click();

        // Multi-stage data picker
        H.visitFullAppEmbeddingUrl({
          url: "/collection/root",
          qs: {
            top_nav: true,
            new_button: true,
            side_nav: false,
            data_picker: "staged",
          },
        });

        cy.button("New").click();
        H.popover().findByText("Question").click();
        H.popover().within(() => {
          cy.findByText("Raw Data").click();
          cy.findByText("Orders").click();
        });
      });

      it("should show the database for a new native question (metabase#21511)", () => {
        const newQuestionQuery = {
          dataset_query: {
            database: null,
            native: {
              query: "",
            },
            type: "native",
          },
          visualization_settings: {},
        };

        H.visitFullAppEmbeddingUrl({
          url: `/question#${H.adhocQuestionHash(newQuestionQuery)}`,
          qs: { side_nav: false },
        });

        cy.findByTestId("native-query-editor-container")
          .findByText(/Sample Database/)
          .should("be.visible");
      });
    });

    describe("desktop logo", () => {
      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      it("should hide main header when there's nothing to display there", () => {
        visitQuestionUrl({
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        cy.findByDisplayValue("Orders");
        cy.findByTestId("app-bar").should("not.exist");
        cy.findByTestId("main-logo").should("not.exist");
        cy.icon("sidebar_closed").should("not.exist");
        cy.button("Toggle sidebar").should("not.exist");
      });
    });

    describe("mobile logo", () => {
      beforeEach(() => {
        cy.viewport("iphone-x");
      });

      // This can't be unit test in AppBar since the logic to hide the AppBar is in its parent component
      it("should hide main header when there's nothing to display there", () => {
        visitQuestionUrl({
          url: "/question/" + ORDERS_QUESTION_ID,
          qs: { side_nav: false, logo: false, breadcrumbs: false },
        });
        cy.findByDisplayValue("Orders");
        cy.findByTestId("app-bar").should("not.exist");
        cy.findByTestId("main-logo").should("not.exist");
        cy.icon("sidebar_closed").should("not.exist");
        cy.button("Toggle sidebar").should("not.exist");
      });
    });
  });

  describe("notebook simple data picker", () => {
    const ordersCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
      },
    };

    /**
     * @param {object} option
     * @param {import("metabase-types/store").InteractiveEmbeddingOptions} [option.searchParameters]
     */
    function startNewEmbeddingQuestion({ searchParameters } = {}) {
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: { new_button: true, ...searchParameters },
      });
      cy.button("New").click();
      H.popover().findByText("Question").click();
    }

    function clickOnDataSource(sourceName) {
      H.getNotebookStep("data").findByText(sourceName).click();
    }

    /**
     *
     * @param {object} options
     * @param {string} options.tableName
     * @param {string} [options.schemaName]
     * @param {string} [options.databaseName]
     */
    function verifyTableSelected({ tableName, schemaName, databaseName }) {
      cy.wait("@getTableMetadata").then(({ response }) => {
        cy.wrap(response.body).its("display_name").should("equal", tableName);
        if (schemaName) {
          cy.wrap(response.body).its("schema").should("equal", schemaName);
        }
        if (databaseName) {
          cy.wrap(response.body).its("db.name").should("equal", databaseName);
        }
      });
    }

    function verifyCardSelected({ cardName, collectionName }) {
      cy.wait("@getCard").then(({ response }) => {
        cy.wrap(response.body).its("name").should("equal", cardName);
        cy.wrap(response.body)
          .its("collection.name")
          .should("equal", collectionName);
      });
    }

    beforeEach(() => {
      cy.signInAsNormalUser();
      cy.intercept("GET", "/api/card/*").as("getCard");
      cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
    });

    it('should respect "entity_types" search parameter (EMB-272)', () => {
      cy.log("test default `entity_types`");
      startNewEmbeddingQuestion();
      H.popover().within(() => {
        cy.findByRole("link", { name: "Reviews" }).should("be.visible");
        cy.findByRole("link", { name: "Orders Model" }).should("be.visible");
      });

      cy.log('test `entity_types=["table"]`');
      startNewEmbeddingQuestion({
        searchParameters: { entity_types: "table" },
      });
      H.popover().within(() => {
        cy.findByRole("link", { name: "Reviews" }).should("be.visible");
        cy.findByRole("link", { name: "Orders Model" }).should("not.exist");
      });

      cy.log('test `entity_types=["model"]`');
      startNewEmbeddingQuestion({
        searchParameters: { entity_types: "model" },
      });
      H.popover().within(() => {
        cy.findByRole("link", { name: "Reviews" }).should("not.exist");
        cy.findByRole("link", { name: "Orders Model" }).should("be.visible");
      });

      cy.log(
        'test `entity_types=["question"]`, question should be ignored, and use the default value ["model", "table"] (metabase#58357)',
      );
      H.createQuestion(ordersCardDetails);
      startNewEmbeddingQuestion({
        searchParameters: {
          entity_types: "question",
        },
      });
      H.popover().within(() => {
        cy.findByRole("link", { name: "Reviews" }).should("be.visible");
        cy.findByRole("link", { name: "Orders Model" }).should("be.visible");
        // Questions shouldn't be shown
        cy.findByRole("link", { name: "Card" }).should("not.exist");
      });
    });

    describe("table", () => {
      it("should select a table in the only database", () => {
        startNewEmbeddingQuestion();
        selectDataSource("Products");
        clickOnDataSource("Products");
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      it(
        "should select a table when there are multiple databases",
        { tags: "@external" },
        () => {
          H.restore("postgres-12");
          cy.signInAsAdmin();
          startNewEmbeddingQuestion();
          selectFirstDataSource("Orders");

          cy.log(
            "assert that even after selecting a data source from one database, the data picker still shows the other data sources database",
          );
          cy.findByTestId("data-step-cell").click();
          H.popover().findAllByRole("link").should("have.length", 13);

          cy.log("close the data picker popover");
          cy.findByTestId("data-step-cell").click();

          cy.log(
            "assert that the data sources should be filtered by the selected database from the starting data source.",
          );
          H.getNotebookStep("data").button("Join data").click();
          H.popover().findAllByRole("link").should("have.length", 8);
          selectDataSource("Accounts");

          verifyTableSelected({
            tableName: "Orders",
            databaseName: "QA Postgres12",
          });
          verifyTableSelected({
            tableName: "Accounts",
            databaseName: "QA Postgres12",
          });
        },
      );

      it(
        "should select a table in a schema-less database",
        { tags: "@external" },
        () => {
          H.restore("mysql-8");
          cy.signInAsAdmin();
          startNewEmbeddingQuestion();
          selectFirstDataSource("Reviews");
          verifyTableSelected({
            tableName: "Reviews",
            databaseName: "QA MySQL8",
          });
        },
      );

      it(
        "should select a table when there are multiple schemas",
        { tags: "@external" },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
          startNewEmbeddingQuestion();
          selectDataSource("Birds");
          verifyTableSelected({
            tableName: "Birds",
            schemaName: "Wild",
            databaseName: "Writable Postgres12",
          });
        },
      );

      it("should be able to join a table when the data source is a table", () => {
        startNewEmbeddingQuestion();
        selectDataSource("Orders");
        H.getNotebookStep("data").button("Join data").click();
        H.popover().findByText("Products").click();
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      it("should not be able to select a question as a data source", () => {
        H.createQuestion(ordersCardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", ordersCardDetails.name);
      });
    });

    describe("question", () => {
      const cardType = "question";

      it("should not be able to select a data source in the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source in a regular collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source in a nested collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: SECOND_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source in a personal collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source in another user personal collection", () => {
        cy.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source when there is no access to the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.log("grant `nocollection` user access to `First collection`");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to select a data source when there is no access to the immediate parent collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: THIRD_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion();
        H.popover().should("not.contain", cardDetails.name);
      });

      it("should not be able to join a card when the data source is a table", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource("Products");
        H.getNotebookStep("data").button("Join data").click();
        H.popover().should("not.contain", cardDetails.name);
      });
    });

    describe("model", () => {
      const cardType = "model";

      it("should select a data source in the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        H.popover().findByRole("link", { name: cardDetails.name }).click();
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Our analytics",
        });
      });

      it("should select a data source in a regular collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      it("should select a data source in a nested collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: SECOND_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Second collection",
        });
      });

      it("should select a data source in a personal collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      it("should select a data source in another user personal collection", () => {
        cy.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      it("should select a data source when there is no access to the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.log("grant `nocollection` user access to `First collection`");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      it("should select a data source when there is no access to the immediate parent collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: THIRD_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion();
        selectDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Third collection",
        });
      });

      it("should be able to join a card when the data source is a table", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: cardType,
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectDataSource("Products");
        H.getNotebookStep("data").button("Join data").click();
        selectDataSource(cardDetails.name);
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
        verifyTableSelected({
          tableName: cardDetails.name,
        });
      });
    });
  });

  describe("notebook multi-stage data picker", () => {
    const ordersCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
      },
    };

    const ordersCountCardDetails = {
      name: "Card",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
    };

    const cardTypeToLabel = {
      question: "Saved Questions",
      model: "Models",
      metric: "Metrics",
    };

    /**
     *
     * @param {object} option
     * @param {boolean} [option.isMultiStageDataPicker]
     * @param {import("metabase-types/store").InteractiveEmbeddingOptions} [option.searchParameters]
     */
    function startNewEmbeddingQuestion({
      isMultiStageDataPicker = false,
      searchParameters,
    } = {}) {
      H.visitFullAppEmbeddingUrl({
        url: "/",
        qs: {
          new_button: true,
          ...(isMultiStageDataPicker && { data_picker: "staged" }),
          ...searchParameters,
        },
      });
      cy.button("New").click();
      H.popover().findByText("Question").click();
    }

    function selectTable({ tableName, schemaName, databaseName }) {
      H.popover().within(() => {
        cy.findByText("Raw Data").click();
        if (databaseName) {
          cy.findByText(databaseName).click();
        }
        if (schemaName) {
          cy.findByText(schemaName).click();
        }
        cy.findByText(tableName).click();
      });
      cy.wait("@getTableMetadata");
    }

    function selectCard({ cardName, cardType, collectionNames }) {
      H.popover().within(() => {
        cy.findByText(cardTypeToLabel[cardType]).click();
        collectionNames.forEach((collectionName) =>
          cy.findByText(collectionName).click(),
        );
        cy.findByText(cardName).click();
      });
      cy.wait("@getTableMetadata");
      if (cardType !== "metric") {
        cy.wait("@getCard");
      }
    }

    function clickOnDataSource(sourceName) {
      H.getNotebookStep("data").findByText(sourceName).click();
    }

    function clickOnJoinDataSource(sourceName) {
      H.getNotebookStep("join")
        .findByLabelText("Right table")
        .findByText(sourceName)
        .click();
    }

    function verifyTableSelected({ tableName, schemaName, databaseName }) {
      H.popover().within(() => {
        cy.findByLabelText(tableName).should(
          "have.attr",
          "aria-selected",
          "true",
        );
        if (schemaName) {
          cy.findByText(schemaName).should("be.visible");
        }
        if (databaseName) {
          cy.findByText(databaseName).should("be.visible");
        }
      });
    }

    function verifyCardSelected({ cardName, collectionName }) {
      H.popover().within(() => {
        cy.findByText(collectionName).should("be.visible");
        cy.findByLabelText(cardName).should(
          "have.attr",
          "aria-selected",
          "true",
        );
      });
    }

    /**
     * Go back from the table selector to the bucket step (where it shows "Raw Data" and "Models").
     *
     * This step only shows when there are more than 1 option in the bucket step, the only time this happens
     * is when there are both selectable models and tables for the current user.
     */
    /** @param {'from-table' | 'from-model'} fromStep */
    function goBackToBucketStep(fromStep = "from-table") {
      H.popover().within(() => {
        cy.icon("chevronleft").click();
        if (fromStep === "from-table") {
          cy.icon("chevronleft").click();
        }
      });
    }

    beforeEach(() => {
      cy.signInAsNormalUser();
      cy.intercept("GET", "/api/card/*").as("getCard");
      cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
    });

    it('should respect "entity_types" search parameter (EMB-228)', () => {
      cy.log('test `entity_types=["table"]`');
      startNewEmbeddingQuestion({
        isMultiStageDataPicker: true,
        searchParameters: { entity_types: "table" },
      });
      H.popover().within(() => {
        /**
         * When we're in table step, it means we don't show models, otherwise, we would have shown
         * the bucket step which has "Raw Data" and "Models" options instead.
         */
        cy.findByText("Sample Database").should("be.visible");
        cy.findByRole("heading", { name: "Orders" }).should("be.visible");
      });

      // We don't have to test every permutations here because we already cover those cases in `EmbeddingDataPicker.unit.spec.tsx`
    });

    describe("table", () => {
      it("should select a table in the only database", () => {
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectTable({ tableName: "Products" });
        clickOnDataSource("Products");
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      it(
        "should select a table when there are multiple databases (metabase#54127)",
        { tags: "@external" },
        () => {
          H.restore("postgres-12");
          cy.signInAsAdmin();
          H.createModelFromTableName({
            tableName: "orders",
            modelName: "Orders Model (Postgres)",
          });
          startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
          selectTable({ tableName: "Orders", databaseName: "QA Postgres12" });
          clickOnDataSource("Orders");
          verifyTableSelected({
            tableName: "Orders",
            databaseName: "QA Postgres12",
          });

          cy.log(
            "assert that even after selecting a data source from one database, the data picker still shows the other data sources database",
          );
          H.popover().within(() => {
            cy.icon("chevronleft").click();
            cy.findByRole("heading", { name: "Sample Database" }).should(
              "be.visible",
            );
            cy.findByRole("heading", { name: "QA Postgres12" }).should(
              "be.visible",
            );

            cy.icon("chevronleft").click();
            cy.findByText("Models").click();
            cy.findByText("Orders Model").should("be.visible");
            cy.findByText("Orders Model (Postgres)").should("be.visible");
          });

          cy.log("close the data picker popover");
          cy.findByTestId("data-step-cell").click();

          cy.log(
            "assert that the tables should be filtered by the selected database from the starting data source.",
          );
          H.getNotebookStep("data").button("Join data").click();
          H.popover().within(() => {
            cy.icon("chevronleft").click();
            cy.findByRole("heading", { name: "Sample Database" }).should(
              "not.exist",
            );
            cy.findByRole("heading", { name: "QA Postgres12" }).should(
              "be.visible",
            );
          });

          cy.log(
            "assert that the models should be filtered by the selected database from the starting data source.",
          );
          H.popover().within(() => {
            cy.icon("chevronleft").click();
            cy.findByText("Models").click();
            cy.findByText("Orders Model").should("not.exist");
            cy.findByText("Orders Model (Postgres)").should("be.visible");
          });
        },
      );

      it(
        "should select a table in a schema-less database",
        { tags: "@external" },
        () => {
          H.restore("mysql-8");
          cy.signInAsAdmin();
          startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
          selectTable({ tableName: "Reviews", databaseName: "QA MySQL8" });
          clickOnDataSource("Reviews");
          verifyTableSelected({
            tableName: "Reviews",
            databaseName: "QA MySQL8",
          });
        },
      );

      it(
        "should select a table when there are multiple schemas",
        { tags: "@external" },
        () => {
          H.restore("postgres-writable");
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
          startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
          selectTable({
            tableName: "Animals",
            schemaName: "Domestic",
            databaseName: "Writable Postgres12",
          });
          clickOnDataSource("Animals");
          verifyTableSelected({
            tableName: "Animals",
            schemaName: "Domestic",
            databaseName: "Writable Postgres12",
          });
        },
      );

      it("should be able to join a table when the data source is a table", () => {
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectTable({
          tableName: "Orders",
        });
        H.getNotebookStep("data").button("Join data").click();
        H.popover().findByText("Products").click();
        clickOnJoinDataSource("Products");
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });

      it("should be able to join a model when the data source is a table", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectTable({
          tableName: "Products",
        });
        H.getNotebookStep("data").button("Join data").click();
        goBackToBucketStep();
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        clickOnJoinDataSource(cardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });
    });

    describe("question", () => {
      beforeEach(() => {
        cy.intercept({
          method: "GET",
          pathname: "/api/database",
          query: {
            saved: "true",
          },
        }).as("getDatabases");
      });

      it("should not be able to select a question", () => {
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        cy.wait("@getDatabases");
        H.popover().within(() => {
          cy.findByText("Models").should("be.visible");
          cy.findByText("Raw Data").should("be.visible");
          cy.findByText("Saved Questions").should("not.exist");
        });
      });
    });

    describe("model", () => {
      it("should select a data source in the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: [],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Our analytics",
        });
      });

      it("should select a data source in a regular collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      it("should select a data source in a nested collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: SECOND_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection", "Second collection"],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Second collection",
        });
      });

      it("should select a data source in a personal collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["Your personal collection"],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Your personal collection",
        });
      });

      it("should select a data source in another user personal collection", () => {
        cy.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: [
            "All personal collections",
            "Robert Tableton's Personal Collection",
          ],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Robert Tableton's Personal Collection",
        });
      });

      it("should select a data source when there is no access to the root collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: FIRST_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.log("grant `nocollection` user access to `First collection`");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["First collection"],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "First collection",
        });
      });

      it("should select a data source when there is no access to the immediate parent collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "model",
          collection_id: THIRD_COLLECTION_ID,
        };

        cy.signInAsAdmin();
        H.createQuestion(cardDetails);
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: {
            [FIRST_COLLECTION_ID]: "read",
            [THIRD_COLLECTION_ID]: "read",
          },
        });

        cy.signIn("nocollection");
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: cardDetails.name,
          cardType: "model",
          collectionNames: ["Third collection"],
        });
        clickOnDataSource(ordersCardDetails.name);
        verifyCardSelected({
          cardName: cardDetails.name,
          collectionName: "Third collection",
        });
      });

      it("should join a table when the data source is a model", () => {
        // Orders Model already exists
        const ordersModelName = "Orders Model";
        const ordersCountModelDetails = {
          ...ordersCountCardDetails,
          name: "Orders Count Model",
          type: "model",
          collection_id: null,
        };
        H.createQuestion(ordersCountModelDetails);

        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: ordersModelName,
          cardType: "model",
          collectionNames: [],
        });

        H.getNotebookStep("data").button("Join data").click();
        goBackToBucketStep("from-model");
        selectCard({
          cardName: ordersCountModelDetails.name,
          cardType: "model",
          collectionNames: [],
        });

        cy.log("select join column");
        H.popover().findByRole("option", { name: "ID" }).click();
        H.popover().findByRole("option", { name: "Count" }).click();

        clickOnJoinDataSource(ordersCountModelDetails.name);
        verifyCardSelected({
          cardName: ordersCountModelDetails.name,
          collectionName: "Our analytics",
        });
      });

      it("should join a model when the data source is a model", () => {
        // Orders Model already exists
        const ordersModelName = "Orders Model";

        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        selectCard({
          cardName: ordersModelName,
          cardType: "model",
          collectionNames: [],
        });

        H.getNotebookStep("data").button("Join data").click();
        goBackToBucketStep("from-model");

        selectTable({
          tableName: "Products",
          databaseName: "Sample Database",
        });
        clickOnJoinDataSource("Products");
        verifyTableSelected({
          tableName: "Products",
          databaseName: "Sample Database",
        });
      });
    });

    describe("metric", () => {
      beforeEach(() => {
        const cardDetails = {
          ...ordersCountCardDetails,
          type: "metric",
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        cy.intercept({
          method: "GET",
          pathname: "/api/database",
          query: {
            saved: "true",
          },
        }).as("getDatabases");
      });

      it("should not be able to select a metric", () => {
        startNewEmbeddingQuestion({ isMultiStageDataPicker: true });
        cy.wait("@getDatabases");
        H.popover().within(() => {
          cy.findByText("Models").should("be.visible");
          cy.findByText("Raw Data").should("be.visible");
          cy.findByText("Metrics").should("not.exist");
        });
      });
    });

    describe('"entity_types" query parameter', () => {
      it('should show only the provided "entity_types"', () => {
        startNewEmbeddingQuestion({
          isMultiStageDataPicker: true,
          searchParameters: {
            entity_types: "table",
          },
        });
        H.popover().within(() => {
          cy.findByText("Models").should("not.exist");
          cy.findByText("Sample Database").should("be.visible");
          cy.findByRole("option", { name: "Orders" }).should("be.visible");
        });
      });

      it('should show models and tables as a default value when not providing "entity_types"', () => {
        cy.log("Test providing `entity_types` as an empty string");
        startNewEmbeddingQuestion({
          isMultiStageDataPicker: true,
          searchParameters: {
            entity_types: "",
          },
        });
        H.popover().within(() => {
          cy.findByText("Models").should("be.visible");
          cy.findByText("Raw Data").should("be.visible");
        });

        cy.log("Test not providing `entity_types`");
        startNewEmbeddingQuestion({
          isMultiStageDataPicker: true,
        });
        H.popover().within(() => {
          cy.findByText("Models").should("be.visible");
          cy.findByText("Raw Data").should("be.visible");
        });
      });
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl({ url: `/dashboard/${ORDERS_DASHBOARD_ID}` });

      cy.findByTestId("dashboard-name-heading").should("be.visible");
      cy.button(/Edited.*by/).should("be.visible");

      H.dashboardHeader().findByRole("img", { name: /info/i }).click();
      H.modal()
        .findByRole("heading", { name: /entity id/i })
        .should("not.exist");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { header: false },
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      H.dashboardGrid().within(() => {
        H.assertTableRowsCount(2000);
      });
    });

    it("should hide the dashboard with multiple tabs header by a param and allow selecting tabs (metabase#38429, metabase#39002)", () => {
      const FIRST_TAB = { id: 1, name: "Tab 1" };
      const SECOND_TAB = { id: 2, name: "Tab 2" };
      H.createDashboardWithTabs({
        dashboard: {
          name: "Dashboard with tabs",
        },
        tabs: [FIRST_TAB, SECOND_TAB],
        dashcards: [
          createMockDashboardCard({
            dashboard_tab_id: FIRST_TAB.id,
            card_id: ORDERS_QUESTION_ID,
            size_x: 10,
            size_y: 8,
          }),
        ],
      }).then((dashboard) => {
        visitDashboardUrl({
          url: `/dashboard/${dashboard.id}`,
          qs: { header: false },
        });
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      H.dashboardGrid().within(() => {
        H.assertTableRowsCount(2000);
      });
      H.goToTab(SECOND_TAB.name);
      cy.findByTestId("dashboard-empty-state").should("be.visible");
    });

    it("should hide the dashboard's additional info by a param", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { additional_info: false },
      });

      cy.findByTestId("dashboard-header")
        .findByText("Orders in a dashboard")
        .should("be.visible");
      cy.findByTestId("dashboard-header")
        .findByText(/Edited/)
        .should("not.exist");
      cy.findByTestId("app-bar")
        .findByText("Our analytics")
        .should("be.visible");
    });

    it("should preserve embedding options with click behavior (metabase#24756)", () => {
      addLinkClickBehavior({
        dashboardId: ORDERS_DASHBOARD_ID,
        linkTemplate: "/question/" + ORDERS_QUESTION_ID,
      });
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      cy.findAllByRole("gridcell").first().click();
      cy.wait("@getCardQuery");

      // I don't know why this test starts to fail, but this command
      // will force the cursor to move away from the app bar, if
      // the cursor is still on the app bar, the logo will not be
      // be visible, since we'll only see the side bar toggle button.
      cy.findByTestId("question-filter-header").realHover();

      cy.findByTestId("main-logo").should("be.visible");
    });

    it("should have parameters header occupied the entire horizontal space when visiting a dashboard via navigation (metabase#30645)", () => {
      const filterId = "50c9eac6";
      const dashboardDetails = {
        name: "interactive dashboard embedding",
        parameters: [
          {
            id: filterId,
            name: "ID",
            slug: "id",
            type: "id",
          },
        ],
      };
      H.createDashboard(dashboardDetails).then(
        ({ body: { id: dashboardId } }) => {
          const textDashcard = H.getTextCardDetails({
            col: 0,
            row: 0,
            size_x: 6,
            size_y: 20,
            text: "I am a very long text card",
          });
          const dashcard = createMockDashboardCard({
            id: H.getNextUnsavedDashboardCardId(),
            col: 8,
            row: 0,
            card_id: ORDERS_QUESTION_ID,
            parameter_mappings: [
              {
                parameter_id: filterId,
                card_id: ORDERS_QUESTION_ID,
                target: [
                  "dimension",
                  ["field", ORDERS.ID, { "base-type": "type/Integer" }],
                ],
              },
            ],
          });
          H.updateDashboardCards({
            dashboard_id: dashboardId,
            cards: [dashcard, textDashcard],
          });
        },
      );

      H.visitFullAppEmbeddingUrl({ url: "/" });

      cy.log("Navigate to a dashboard via in-app navigation");
      H.navigationSidebar().findByText("Our analytics").click();
      cy.findByRole("main").findByText(dashboardDetails.name).click();
      H.navigationSidebar()
        .findByText("Our analytics")
        .should("not.be.visible");

      cy.get("main header")
        .findByText(dashboardDetails.name)
        .should("be.visible");
      H.getDashboardCard()
        .findByText("I am a very long text card")
        .should("be.visible");

      // The bug won't appear if we scroll instantly and check the position of the dashboard parameter header.
      // I suspect that happens because we used to calculate the dashboard parameter header position in JavaScript,
      // which could take some time.
      const FPS = 1000 / 60;
      cy.findByRole("main").scrollTo("bottom", { duration: 2 * FPS });

      H.getDashboardCard()
        .findByText("I am a very long text card")
        .should("not.be.visible");
      cy.findByTestId("dashboard-parameters-widget-container").then(
        ($dashboardParameters) => {
          const dashboardParametersRect =
            $dashboardParameters[0].getBoundingClientRect();
          expect(dashboardParametersRect.x).to.equal(0);
        },
      );
    });

    describe("navigation through postMessage", () => {
      const assertIsLost = () => {
        cy.get("@iframeBody")
          .find("[role=status]")
          .should("contain", "We're a little lost");
      };

      const assertIsDashboard = () => {
        cy.get("@iframeBody")
          .find("[data-testid=table-footer]")
          .should("contain", "Showing first 2,000 rows");
      };

      const assertIsQuestion = () => {
        cy.get("@iframeBody")
          .find("[data-testid=question-row-count]")
          .should("contain", "Showing first 2,000 rows");
      };

      const goTo = (url) => {
        H.postMessageToIframe({
          iframeSelector: 'iframe[src*="localhost:4000/dashboard"]',
          messageData: {
            metabase: { type: "location", location: url },
          },
        });
      };

      it("should handle invalid questions/dashboards (metabase#65500)", () => {
        cy.signInAsAdmin();

        H.createDashboardWithTabs({
          dashboard: {
            name: "Dashboard with tabs",
          },
          dashcards: [
            createMockDashboardCard({
              card_id: ORDERS_QUESTION_ID,
              size_x: 10,
              size_y: 8,
            }),
          ],
        }).then((dashboard) => {
          H.loadInteractiveIframeEmbedTestPage({
            dashboardId: dashboard.id,
            iframeSelector: 'iframe[src*="localhost:4000/dashboard"]',
          });

          cy.get('iframe[src*="localhost:4000/dashboard"]')
            .its("0.contentDocument.body")
            .should("not.be.empty")
            .then(cy.wrap)
            .as("iframeBody");

          assertIsDashboard();

          // invalid dashboard -> valid dashboard
          goTo("/dashboard/9999990");
          assertIsLost();
          goTo(`/dashboard/${dashboard.id}`);
          assertIsDashboard();

          // invalid question -> valid question
          goTo("/question/9999990");
          assertIsLost();
          goTo(`/question/${ORDERS_QUESTION_ID}`);
          assertIsQuestion();

          // invalid question -> valid dashboard
          goTo("/question/9999990");
          assertIsLost();
          goTo(`/dashboard/${dashboard.id}`);
          assertIsDashboard();

          // invalid dashboard -> valid question
          goTo("/dashboard/9999990");
          assertIsLost();
          goTo(`/question/${ORDERS_QUESTION_ID}`);
          assertIsQuestion();
        });
      });
    });

    it("should send `frame` message with dashboard height when the dashboard is resized (metabase#37437)", () => {
      const TAB_1 = { id: 1, name: "Tab 1" };
      const TAB_2 = { id: 2, name: "Tab 2" };
      H.createDashboardWithTabs({
        tabs: [TAB_1, TAB_2],
        name: "Dashboard",
        dashcards: [
          createMockTextDashboardCard({
            dashboard_tab_id: TAB_1.id,
            size_x: 10,
            size_y: 20,
            text: "I am a text card",
          }),
        ],
      }).then((dashboard) => {
        H.visitFullAppEmbeddingUrl({
          url: `/dashboard/${dashboard.id}`,
          onBeforeLoad(window) {
            cy.spy(window.parent, "postMessage").as("postMessage");
          },
        });
      });

      // TODO: Find a way to assert that this is the last call.
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: Cypress.sinon.match((value) => value > 1000),
          },
        },
      });

      cy.get("@postMessage").invoke("resetHistory");
      cy.findByRole("tab", { name: TAB_2.name }).click();
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: Cypress.sinon.match((value) => value < 1000),
          },
        },
      });

      cy.get("@postMessage").invoke("resetHistory");
      cy.findByTestId("app-bar").findByText("Our analytics").click();

      cy.findByRole("heading", { name: "Usage analytics" }).should(
        "be.visible",
      );
      cy.get("@postMessage").should("have.been.calledWith", {
        metabase: {
          type: "frame",
          frame: {
            mode: "fit",
            height: 800,
          },
        },
      });
    });

    it("should allow downloading question results when logged in via Google SSO (metabase#39848)", () => {
      const CSRF_TOKEN = "abcdefgh";
      cy.intercept("GET", "/api/user/current", (req) => {
        req.on("response", (res) => {
          res.headers["X-Metabase-Anti-CSRF-Token"] = CSRF_TOKEN;
        });
      });
      cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query/csv").as(
        "CsvDownload",
      );
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
      });

      H.getDashboardCard().realHover();
      H.getDashboardCardMenu().click();

      H.exportFromDashcard(".csv");

      cy.wait("@CsvDownload").then((interception) => {
        expect(
          interception.request.headers["x-metabase-anti-csrf-token"],
        ).to.equal(CSRF_TOKEN);
      });
    });

    it("should send 'X-Metabase-Client' header for api requests", () => {
      H.visitFullAppEmbeddingUrl({ url: `/dashboard/${ORDERS_DASHBOARD_ID}` });

      cy.wait("@getDashboard").then(({ request }) => {
        expect(request?.headers?.["x-metabase-client"]).to.equal(
          "embedding-iframe",
        );
      });
    });
  });

  describe("x-ray dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitXrayDashboardUrl({ url: "/auto/dashboard/table/1" });

      cy.findByRole("heading", { name: "More X-rays" }).should("be.visible");
      cy.button("Save this").should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitXrayDashboardUrl({
        url: "/auto/dashboard/table/1",
        qs: { header: false },
      });

      cy.findByRole("heading", { name: "More X-rays" }).should("be.visible");
      cy.button("Save this").should("not.exist");
    });
  });

  describe("documents > comments", () => {
    it("should not display comments in an embedded app", () => {
      H.activateToken("bleeding-edge");
      const DOCUMENT_ID = 1;
      const PARAGRAPH_ID = "b7fa322a-964e-d668-8d30-c772ef4f0022";

      H.createDocument({
        idAlias: "documentId",
        name: "Lorem ipsum",
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: {
                _id: PARAGRAPH_ID,
              },
              content: [
                {
                  type: "text",
                  text: "Lorem ipsum dolor sit amet.",
                },
              ],
            },
          ],
        },
      });
      H.createComment({
        target_type: "document",
        target_id: DOCUMENT_ID,
        child_target_id: PARAGRAPH_ID,
        parent_comment_id: null,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { _id: uuid() },
              content: [{ type: "text", text: "Test comment" }],
            },
          ],
        },
        html: "<p>Test comment</p>",
      });

      cy.intercept({
        method: "GET",
        path: "/api/document/*",
      }).as("documentGet");

      cy.intercept({
        method: "GET",
        path: "/api/comment/*",
      }).as("commentGet");

      H.visitFullAppEmbeddingUrl({
        url: `/document/${DOCUMENT_ID}`,
      });

      cy.wait("@documentGet");

      cy.findByLabelText("Show all comments").should("not.exist");

      cy.findAllByRole("link", { name: "Comments" }).should("not.exist");

      cy.get("@commentGet.all").should("have.length", 0);
    });
  });
});

describe("scenarios > embedding > full app - jwt sso integration", () => {
  /**
   * These tests are meant to validate the JWT SSO flow.
   *
   * We need to mock the JWT provider url even though we only care to check the
   * redirect URL, this is because if the request fails, cypress will see
   * `chrome-error://chromewebdata/` as the url.
   */
  const baseUrl = Cypress.config("baseUrl");
  const dashboardId = ORDERS_DASHBOARD_ID;
  const jwtSecret =
    "0000000000000000000000000000000000000000000000000000000000000000";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    // enable interactive embedding
    H.updateSetting("enable-embedding-interactive", true);
    H.updateSetting("embedding-app-origins-interactive", "http://localhost:*");
    H.updateSetting("embedding-secret-key", jwtSecret);

    // setup jwt
    H.updateSetting(
      "jwt-identity-provider-uri",
      "http://localhost:8888/jwt-provider",
    );
    H.updateSetting("jwt-shared-secret", jwtSecret);
    H.updateSetting("jwt-enabled", true);

    cy.intercept("POST", `/api/card/${ORDERS_QUESTION_ID}/query`).as(
      "getCardQuery",
    );
    addLinkClickBehavior({
      dashboardId,
      linkTemplate: "/question/{{test_attribute}}",
    });

    cy.signOut(); // we *need* to sign out, otherwise the SSO process won't kick in
  });

  it("when trying to access a resource while un-authenticated, it should pass the path via return_to to the jwt provider", () => {
    cy.intercept(/http:\/\/localhost:8888\/.*/, (req) => {
      req.reply({
        statusCode: 200,
        body: "ok",
      });
    }).as("jwt-provider");

    H.visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboardId}` });

    cy.wait("@jwt-provider").then((interception) => {
      expect(interception.request.url).to.equal(
        `http://localhost:8888/jwt-provider?return_to=/dashboard/${dashboardId}`,
      );
    });
  });

  it("should authenticate the user correctly if the JWT provider returns a valid JWT token", () => {
    // 1) sign a jwt for the user
    cy.task("signJwt", {
      payload: {
        email: USERS.normal.email,
        exp: Math.round(Date.now() / 1000) + 10 * 60,
      },
      secret: jwtSecret,
    }).then((jwtToken) => {
      // 2) mock the JWT provider to redirect to the auth/sso endpoint with the JWT
      cy.intercept(/http:\/\/localhost:8888\/.*/, (req) => {
        const redirectUrl = `${baseUrl}/auth/sso?jwt=${jwtToken}&return_to=/dashboard/${dashboardId}`;
        req.redirect(redirectUrl);
      }).as("jwt-provider");
    });

    // 3) visit the dashboard
    H.visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboardId}` });

    cy.wait("@jwt-provider");

    // 4) verify the user is authenticated and can access the dashboard
    cy.url().should("equal", `${baseUrl}/dashboard/${dashboardId}`);
    H.main().findByText("Orders in a dashboard").should("be.visible");
  });

  it("should pass JWT user attributes to click behavior custom destinations (metabase#65942)", () => {
    const jwtAttributeValue = ORDERS_QUESTION_ID;

    // 1) set up a click behavior that uses a user attribute in the URL
    // Added in beforeeach so it uses the admin user

    // 2) sign a jwt for the user with a custom attribute
    cy.task("signJwt", {
      payload: {
        email: USERS.normal.email,
        exp: Math.round(Date.now() / 1000) + 10 * 60,
        test_attribute: jwtAttributeValue,
      },
      secret: jwtSecret,
    }).then((jwtToken) => {
      // 3) mock the JWT provider to redirect to the auth/sso endpoint with the JWT
      cy.intercept(/http:\/\/localhost:8888\/.*/, (req) => {
        const redirectUrl = `${baseUrl}/auth/sso?jwt=${jwtToken}&return_to=/dashboard/${dashboardId}`;
        req.redirect(redirectUrl);
      }).as("jwt-provider");
    });

    // 4) visit the dashboard as embedded
    H.visitFullAppEmbeddingUrl({ url: `/dashboard/${dashboardId}` });

    cy.wait("@jwt-provider");

    // 5) verify user is on dashboard
    cy.url().should("equal", `${baseUrl}/dashboard/${dashboardId}`);

    cy.findAllByRole("gridcell").first().click();
    cy.wait("@getCardQuery");

    cy.findByTestId("question-filter-header").realHover();
    cy.findByTestId("main-logo").should("be.visible");
  });
});

const visitQuestionUrl = (urlOptions) => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getCardQuery");
};

const visitDashboardUrl = (urlOptions) => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getDashboard");
  cy.wait("@getDashCardQuery");
};

const visitXrayDashboardUrl = (urlOptions) => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getXrayDashboard");
};

const addLinkClickBehavior = ({ dashboardId, linkTemplate }) => {
  cy.request("GET", `/api/dashboard/${dashboardId}`).then(({ body }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      dashcards: body.dashcards.map((card) => ({
        ...card,
        visualization_settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate,
          },
        },
      })),
    });
  });
};

const sideNav = () => {
  return cy.findByTestId("main-navbar-root");
};

const selectDataSource = (dataSource) => {
  H.popover().findByRole("link", { name: dataSource }).click();
};

/**
 *
 * @param {string} dataSource  When using with QA database, the first option would be the table from the QA database.
 */
const selectFirstDataSource = (dataSource) => {
  H.popover().findAllByRole("link", { name: dataSource }).first().click();
};

import { H } from "e2e/support";
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
  SECOND_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createMockDashboardCard,
  createMockTextDashboardCard,
} from "metabase-types/api/mocks";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;

H.describeEE("scenarios > embedding > full app", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.setTokenFeatures("all");
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
        H.visitFullAppEmbeddingUrl({
          url: "/collection/root",
          qs: { top_nav: true, new_button: true, side_nav: false },
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

  describe("notebook", () => {
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

    function startNewEmbeddingQuestion() {
      H.visitFullAppEmbeddingUrl({ url: "/", qs: { new_button: true } });
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
        collectionNames.forEach(collectionName =>
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

    function verifyMetricClause(metricName) {
      H.getNotebookStep("summarize")
        .findByTestId("aggregate-step")
        .findByText(metricName)
        .should("be.visible");
    }

    beforeEach(() => {
      cy.signInAsNormalUser();
      cy.intercept("GET", "/api/card/*").as("getCard");
      cy.intercept("GET", "/api/table/*/query_metadata").as("getTableMetadata");
    });

    describe("table", () => {
      it("should select a table in the only database", () => {
        startNewEmbeddingQuestion();
        selectTable({ tableName: "Products" });
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
          selectTable({ tableName: "Orders", databaseName: "QA Postgres12" });
          clickOnDataSource("Orders");
          verifyTableSelected({
            tableName: "Orders",
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
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.restore("postgres-writable");
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });
          startNewEmbeddingQuestion();
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
        startNewEmbeddingQuestion();
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

      it("should be able to join a table when the data source is a question", () => {
        startNewEmbeddingQuestion();
        selectCard({
          cardName: "Orders",
          cardType: "question",
          collectionNames: [],
        });
        H.getNotebookStep("data").button("Join data").click();
        H.popover().within(() => {
          cy.icon("chevronleft").click();
          cy.icon("chevronleft").click();
        });
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

    ["question", "model"].forEach(cardType => {
      describe(cardType, () => {
        it("should select a data source in the root collection", () => {
          const cardDetails = {
            ...ordersCardDetails,
            type: cardType,
            collection_id: null,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
            type: cardType,
            collection_id: FIRST_COLLECTION_ID,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
            type: cardType,
            collection_id: SECOND_COLLECTION_ID,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
            type: cardType,
            collection_id: NORMAL_PERSONAL_COLLECTION_ID,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
            type: cardType,
            collection_id: NORMAL_PERSONAL_COLLECTION_ID,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
          selectCard({
            cardName: cardDetails.name,
            cardType,
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
          selectCard({
            cardName: cardDetails.name,
            cardType,
            collectionNames: ["Third collection"],
          });
          clickOnDataSource(ordersCardDetails.name);
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
          selectTable({
            tableName: "Products",
          });
          H.getNotebookStep("data").button("Join data").click();
          H.popover().within(() => {
            cy.icon("chevronleft").click();
            cy.icon("chevronleft").click();
          });
          selectCard({
            cardName: cardDetails.name,
            cardType,
            collectionNames: ["First collection"],
          });
          clickOnJoinDataSource(cardDetails.name);
          verifyCardSelected({
            cardName: cardDetails.name,
            collectionName: "First collection",
          });
        });

        it("should be able to join a card when the data source is a question", () => {
          const cardDetails = {
            ...ordersCardDetails,
            type: cardType,
            collection_id: FIRST_COLLECTION_ID,
          };
          H.createQuestion(cardDetails);
          startNewEmbeddingQuestion();
          selectCard({
            cardName: "Orders",
            cardType: "question",
            collectionNames: [],
          });
          H.getNotebookStep("data").button("Join data").click();
          H.popover().within(() => {
            cy.icon("chevronleft").click();
            cy.icon("chevronleft").click();
          });
          selectCard({
            cardName: cardDetails.name,
            cardType,
            collectionNames: ["First collection"],
          });
          H.popover().findByText("ID").click();
          H.popover().findByText("ID").click();
          clickOnJoinDataSource(cardDetails.name);
          verifyCardSelected({
            cardName: cardDetails.name,
            collectionName: "First collection",
          });
        });
      });
    });

    describe("metric", () => {
      it("should select a data source in the root collection", () => {
        const cardDetails = {
          ...ordersCountCardDetails,
          type: "metric",
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectCard({
          cardName: cardDetails.name,
          cardType: cardDetails.type,
          collectionNames: [],
        });
        verifyMetricClause(cardDetails.name);
        clickOnDataSource("Orders");
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
      });

      it("should select a data source in a regular collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "metric",
          collection_id: FIRST_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectCard({
          cardName: cardDetails.name,
          cardType: cardDetails.type,
          collectionNames: ["First collection"],
        });
        verifyMetricClause(cardDetails.name);
        clickOnDataSource("Orders");
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
      });

      it("should select a data source in a nested collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "metric",
          collection_id: SECOND_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectCard({
          cardName: cardDetails.name,
          cardType: cardDetails.type,
          collectionNames: ["First collection", "Second collection"],
        });
        verifyMetricClause(cardDetails.name);
        clickOnDataSource("Orders");
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
      });

      it("should select a data source in a personal collection", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "metric",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectCard({
          cardName: cardDetails.name,
          cardType: cardDetails.type,
          collectionNames: ["Your personal collection"],
        });
        verifyMetricClause(cardDetails.name);
        clickOnDataSource("Orders");
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
      });

      it("should select a data source in another user personal collection", () => {
        cy.signInAsAdmin();
        const cardDetails = {
          ...ordersCardDetails,
          type: "metric",
          collection_id: NORMAL_PERSONAL_COLLECTION_ID,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectCard({
          cardName: cardDetails.name,
          cardType: cardDetails.type,
          collectionNames: [
            "All personal collections",
            "Robert Tableton's Personal Collection",
          ],
        });
        verifyMetricClause(cardDetails.name);
        clickOnDataSource("Orders");
        verifyTableSelected({
          tableName: "Orders",
          databaseName: "Sample Database",
        });
      });

      it("should not be able to join a metric", () => {
        const cardDetails = {
          ...ordersCardDetails,
          type: "metric",
          collection_id: null,
        };
        H.createQuestion(cardDetails);
        startNewEmbeddingQuestion();
        selectTable({
          tableName: "Orders",
        });
        H.getNotebookStep("data").button("Join data").click();
        H.popover().within(() => {
          cy.icon("chevronleft").click();
          cy.icon("chevronleft").click();
          cy.findByText("Raw Data").should("be.visible");
          cy.findByText("Saved Questions").should("be.visible");
          cy.findByText("Models").should("be.visible");
          cy.findByText("Metrics").should("not.exist");
        });
      });
    });
  });

  describe("dashboards", () => {
    it("should show the dashboard header by default", () => {
      visitDashboardUrl({ url: `/dashboard/${ORDERS_DASHBOARD_ID}` });

      cy.findByTestId("dashboard-name-heading").should("be.visible");
      cy.button(/Edited.*by/).should("be.visible");
    });

    it("should hide the dashboard header by a param", () => {
      visitDashboardUrl({
        url: `/dashboard/${ORDERS_DASHBOARD_ID}`,
        qs: { header: false },
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      H.dashboardGrid()
        .findByText("Rows 1-6 of first 2000")
        .should("be.visible");
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
      }).then(dashboard => {
        visitDashboardUrl({
          url: `/dashboard/${dashboard.id}`,
          qs: { header: false },
        });
      });
      cy.findByRole("heading", { name: "Orders in a dashboard" }).should(
        "not.exist",
      );
      H.dashboardGrid()
        .findByText("Rows 1-6 of first 2000")
        .should("be.visible");
      H.goToTab(SECOND_TAB.name);
      cy.findByTestId("dashboard-parameters-and-cards")
        .findByText("There's nothing here, yet.")
        .should("be.visible");
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

      cy.findAllByRole("cell").first().click();
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
      cy.createDashboard(dashboardDetails).then(
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
        $dashboardParameters => {
          const dashboardParametersRect =
            $dashboardParameters[0].getBoundingClientRect();
          expect(dashboardParametersRect.x).to.equal(0);
        },
      );
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
      }).then(dashboard => {
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
            height: Cypress.sinon.match(value => value > 1000),
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
            height: Cypress.sinon.match(value => value < 400),
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
      cy.intercept("GET", "/api/user/current", req => {
        req.on("response", res => {
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

      cy.wait("@CsvDownload").then(interception => {
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
});

const visitQuestionUrl = urlOptions => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getCardQuery");
};

const visitDashboardUrl = urlOptions => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getDashboard");
  cy.wait("@getDashCardQuery");
};

const visitXrayDashboardUrl = urlOptions => {
  H.visitFullAppEmbeddingUrl(urlOptions);
  cy.wait("@getXrayDashboard");
};

const addLinkClickBehavior = ({ dashboardId, linkTemplate }) => {
  cy.request("GET", `/api/dashboard/${dashboardId}`).then(({ body }) => {
    cy.request("PUT", `/api/dashboard/${dashboardId}`, {
      dashcards: body.dashcards.map(card => ({
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

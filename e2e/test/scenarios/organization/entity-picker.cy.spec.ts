import { H } from "e2e/support";
import { USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  FIRST_COLLECTION_ID,
  NORMAL_PERSONAL_COLLECTION_ID,
  NO_COLLECTION_PERSONAL_COLLECTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import * as H from "e2e/support/helpers";
import type { DashboardCard } from "metabase-types/api";

const { ORDERS_ID } = SAMPLE_DATABASE;
const { ALL_USERS_GROUP } = USER_GROUPS;

const cardDetails: H.StructuredQuestionDetails = {
  name: "Question",
  type: "question",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
};

describe("scenarios > organization > entity picker", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  describe("data picker", () => {
    describe("tables", () => {
      it("should select a table from local search results", () => {
        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          enterSearchText({
            text: "prod",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Sample Database").should("be.checked");
          assertSearchResults({
            foundItems: ["Products"],
            totalFoundItemsCount: 1,
          });
          cy.findByText("Products").click();
        });
        H.getNotebookStep("data").findByText("Products").should("be.visible");
      });

      it("should select a table from global search results", () => {
        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          enterSearchText({
            text: "prod",
            placeholder: "Search this database or everywhere…",
          });
          selectGlobalSearchTab();
          assertSearchResults({
            foundItems: ["Products"],
            totalFoundItemsCount: 3,
          });
          cy.findByText("Products").click();
        });
        H.getNotebookStep("data").findByText("Products").should("be.visible");
      });

      it("should switch between recents and table tabs", () => {
        cy.signInAsAdmin();
        H.startNewQuestion();

        cy.log("create a recent item");
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText("Products").click();
        });

        cy.log(
          "should search globally for recents and locally for tables by default",
        );
        H.getNotebookStep("data").findByText("Products").click();
        H.entityPickerModal().within(() => {
          cy.log("local -> global transition without changing search text");
          H.entityPickerModalTab("Tables").click();
          enterSearchText({
            text: "Orders",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Sample Database").should("be.checked");
          H.entityPickerModalTab("Recents").click();
          existingSearchTab().click();
          globalSearchTab().should("not.exist");
          localSearchTab("Sample Database").should("not.exist");
          assertSearchResults({
            foundItems: ["Orders, Count", "Orders Model"],
          });

          cy.log("global -> local transition without changing search text");
          H.entityPickerModalTab("Tables").click();
          existingSearchTab().click();
          localSearchTab("Sample Database").should("be.checked");
          assertSearchResults({
            foundItems: ["Orders"],
            totalFoundItemsCount: 1,
          });

          cy.log("local -> global transition with changing search text");
          H.entityPickerModalTab("Recents").click();
          enterSearchText({
            text: "people",
            placeholder: "Search…",
          });
          globalSearchTab().should("not.exist");
          localSearchTab("Sample Database").should("not.exist");
          assertSearchResults({
            foundItems: ["People"],
          });

          cy.log("return to the previous tab when the search input is cleared");
          cy.findByPlaceholderText("Search…").clear();
          H.entityPickerModalTab("Recents").should(
            "have.attr",
            "aria-selected",
            "true",
          );
        });
      });

      it("should search for tables in the only database", () => {
        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          enterSearchText({
            text: "prod",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Sample Database").should("be.checked");
          assertSearchResults({
            foundItems: ["Products"],
            notFoundItems: ["Orders"],
            totalFoundItemsCount: 1,
          });
          cy.findByText("Products").click();
        });
        H.getNotebookStep("data").findByText("Products").should("be.visible");
      });

      it("should search by table display names and not real names", () => {
        cy.signInAsAdmin();
        cy.request("PUT", `/api/table/${ORDERS_ID}`, {
          display_name: "Events",
        });
        cy.signInAsNormalUser();
        H.startNewQuestion();

        cy.log("real table name should give no results");
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          enterSearchText({
            text: "Orders",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Sample Database").should("be.checked");
          assertSearchResults({
            notFoundItems: ["Orders"],
            totalFoundItemsCount: 0,
          });
          cy.findByText("Didn't find anything").should("be.visible");
        });

        cy.log("display table name should be used to search for a table");
        H.entityPickerModal().within(() => {
          enterSearchText({
            text: "Events",
            placeholder: "Search this database or everywhere…",
          });
          localSearchTab("Sample Database").should("be.checked");
          assertSearchResults({
            foundItems: ["Events"],
            notFoundItems: ["Orders"],
            totalFoundItemsCount: 1,
          });
          cy.findByText("Events").click();
        });
        H.getNotebookStep("data").findByText("Events").should("be.visible");
      });

      it(
        "should search for tables when there are multiple databases",
        { tags: "@external" },
        () => {
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.restore("postgres-writable");
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          cy.log("first database - pre-selected");
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            enterSearchText({
              text: "prod",
              placeholder: "Search this database or everywhere…",
            });
            localSearchTab("Sample Database").should("be.checked");
            assertSearchResults({
              foundItems: ["Products"],
              notFoundItems: ["Orders"],
              totalFoundItemsCount: 1,
            });
          });

          cy.log("second database");
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            cy.findByText("Writable Postgres12").click();
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Domestic").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals"],
              notFoundItems: ["Birds"],
              totalFoundItemsCount: 1,
            });
          });

          cy.log("first database - manually selected");
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            cy.findByText("Sample Database").click();
            enterSearchText({
              text: "prod",
              placeholder: "Search this database or everywhere…",
            });
            localSearchTab("Sample Database").should("be.checked");
            assertSearchResults({
              foundItems: ["Products"],
              notFoundItems: ["Orders"],
              totalFoundItemsCount: 1,
            });
          });
        },
      );

      it(
        "should search for tables in a multi-schema database",
        { tags: "@external" },
        () => {
          H.resetTestTable({ type: "postgres", table: "multi_schema" });
          H.restore("postgres-writable");
          cy.signInAsAdmin();
          H.resyncDatabase({ dbId: WRITABLE_DB_ID });

          cy.log("first schema");
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            cy.findByText("Writable Postgres12").click();
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Domestic").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals"],
              notFoundItems: ["Birds"],
              totalFoundItemsCount: 1,
            });
          });

          cy.log("second schema");
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            cy.findByText("Wild").click();
            enterSearchText({
              text: "s",
              placeholder: "Search this schema or everywhere…",
            });
            localSearchTab("Wild").should("be.checked");
            assertSearchResults({
              foundItems: ["Animals", "Birds"],
              totalFoundItemsCount: 2,
            });
          });
        },
      );

      it(
        "should search for tables in a schema-less database",
        { tags: "@external" },
        () => {
          H.restore("mysql-8");
          cy.signInAsAdmin();
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab("Tables").click();
            cy.findByText("QA MySQL8").click();
            enterSearchText({
              text: "orders",
              placeholder: "Search this database or everywhere…",
            });
            localSearchTab("QA MySQL8").should("be.checked");
            assertSearchResults({
              foundItems: ["Orders"],
              notFoundItems: ["Products"],
              totalFoundItemsCount: 1,
            });
          });
        },
      );
    });

    describe("cards", () => {
      const tabs = ["Saved questions", "Models", "Metrics"];

      it("should select a card from local search results", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.signInAsNormalUser();

        const testCases = [
          {
            tab: "Saved questions",
            cardName: "Root question 1",
            sourceName: "Root question 1",
          },
          {
            tab: "Models",
            cardName: "Root model 2",
            sourceName: "Root model 2",
          },
          {
            tab: "Metrics",
            cardName: "Root metric 1",
            sourceName: "Orders",
          },
        ];
        testCases.forEach(({ tab, cardName, sourceName }) => {
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab(tab).click();
            enterSearchText({
              text: cardName,
              placeholder: "Search this collection or everywhere…",
            });
            cy.findByText(cardName).click();
          });
          H.getNotebookStep("data").findByText(sourceName).should("be.visible");
          H.visualize();
        });
      });

      it("should select a card from global search results", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.signInAsNormalUser();

        const testCases = [
          {
            tab: "Saved questions",
            cardName: "Regular question 1",
            sourceName: "Regular question 1",
          },
          {
            tab: "Models",
            cardName: "Regular model 2",
            sourceName: "Regular model 2",
          },
          {
            tab: "Metrics",
            cardName: "Regular metric 1",
            sourceName: "Orders",
          },
        ];
        testCases.forEach(({ tab, cardName, sourceName }) => {
          H.startNewQuestion();
          H.entityPickerModal().within(() => {
            H.entityPickerModalTab(tab).click();
            enterSearchText({
              text: cardName,
              placeholder: "Search this collection or everywhere…",
            });
            selectGlobalSearchTab();
            cy.findByText(cardName).click();
          });
          H.getNotebookStep("data").findByText(sourceName).should("be.visible");
          H.visualize();
        });
      });

      it("should search for cards for a normal user", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.signInAsNormalUser();
        H.startNewQuestion();
        testCardSearchForNormalUser({ tabs });
      });

      it("should search for cards when there is no access to the root collection", () => {
        cy.signInAsAdmin();
        createTestCards();
        cy.log("grant `nocollection` user access to `First collection`");
        cy.log("personal collections are always available");
        cy.updateCollectionGraph({
          [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "read" },
        });

        cy.signIn("nocollection");
        H.startNewQuestion();
        testCardSearchForInaccessibleRootCollection({
          tabs,
          isRootSelected: true,
        });
      });

      it("should not allow local search for `all personal collections`", () => {
        cy.signInAsAdmin();
        createTestCards();
        H.startNewQuestion();
        testCardSearchForAllPersonalCollections({ tabs });
      });
    });
  });

  describe("question picker", () => {
    const tabs = ["Questions", "Models", "Metrics"];

    it("should select a card from local search results", () => {
      cy.signInAsAdmin();
      createTestCards();
      cy.signInAsNormalUser();

      const testCases = [
        { tab: "Questions", cardName: "Root question 1" },
        { tab: "Models", cardName: "Root model 2" },
        { tab: "Metrics", cardName: "Root metric 1" },
      ];
      testCases.forEach(({ tab, cardName }) => {
        selectQuestionFromDashboard();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab(tab).click();
          enterSearchText({
            text: cardName,
            placeholder: "Search this collection or everywhere…",
          });
          cy.findByText(cardName).click();
        });
        H.getDashboardCard().findByText(cardName).should("be.visible");
      });
    });

    it("should select a card from global search results", () => {
      cy.signInAsAdmin();
      createTestCards();
      cy.signInAsNormalUser();

      const testCases = [
        { tab: "Questions", cardName: "Regular question 1" },
        { tab: "Models", cardName: "Regular model 2" },
        { tab: "Metrics", cardName: "Regular metric 1" },
      ];
      testCases.forEach(({ tab, cardName }) => {
        selectQuestionFromDashboard();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab(tab).click();
          enterSearchText({
            text: cardName,
            placeholder: "Search this collection or everywhere…",
          });
          selectGlobalSearchTab();
          cy.findByText(cardName).click();
        });
        H.getDashboardCard().findByText(cardName).should("be.visible");
      });
    });

    it("should search for cards for a normal user", () => {
      cy.signInAsAdmin();
      createTestCards();
      cy.signInAsNormalUser();
      selectQuestionFromDashboard();
      testCardSearchForNormalUser({ tabs });
    });

    it("should search for cards when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestCards();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });

      cy.signIn("nocollection");
      selectQuestionFromDashboard({ collection_id: FIRST_COLLECTION_ID });
      testCardSearchForInaccessibleRootCollection({
        tabs,
        isRootSelected: false,
      });
    });

    it("should not allow local search for `all personal collections`", () => {
      cy.signInAsAdmin();
      createTestCards();
      selectQuestionFromDashboard();
      testCardSearchForAllPersonalCollections({ tabs });
    });
  });

  describe("collection picker", () => {
    it("should select a collection from local search results", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        enterSearchText({
          text: "first",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        cy.findByText("First collection").click();
        cy.button("Move").click();
      });
      H.undoToast().findByText("First collection").should("be.visible");
    });

    it("should select a collection from global search results", () => {
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        enterSearchText({
          text: "second",
          placeholder: "Search this collection or everywhere…",
        });
        selectGlobalSearchTab();
        cy.findByText("Second collection").click();
        cy.button("Move").click();
      });
      H.undoToast().findByText("Second collection").should("be.visible");
    });

    it("should search for collections for a normal user", () => {
      cy.signInAsAdmin();
      createTestCollections();
      cy.signInAsNormalUser();
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      cy.log("root collection - automatically selected");
      H.entityPickerModal().within(() => {
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["Second collection"],
        });
        selectGlobalSearchTab();
        assertSearchResults({
          foundItems: ["First collection", "Second collection"],
        });
        selectLocalSearchTab("Our analytics");
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["Second collection"],
        });
      });

      cy.log("regular collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        cy.findByText("First collection").click();
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("First collection").should("be.checked");
        assertSearchResults({
          foundItems: ["Second collection"],
          notFoundItems: ["First collection", "Third collection"],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal collection 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Robert Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["Normal personal collection 1"],
          notFoundItems: [
            "Normal personal collection 2",
            "Admin personal collection 1",
          ],
        });
      });
    });

    it("should search for collections when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestCollections();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.signIn("nocollection");
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      cy.log("root collection");
      H.entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        enterSearchText({
          text: "collection",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Collections").should("be.checked");
        assertSearchResults({
          foundItems: ["First collection"],
          notFoundItems: ["No Collection Tableton's Personal Collection"],
        });
        selectGlobalSearchTab();
        assertSearchResults({
          foundItems: [
            "First collection",
            "No Collection Tableton's Personal Collection",
          ],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal collection 2",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("No Collection Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["No collection personal collection 2"],
          notFoundItems: [
            "No collection personal collection 1",
            "Admin personal collection 2",
            "Normal personal collection 2",
          ],
        });
      });
    });

    it("should not allow local search for `all personal collections`", () => {
      cy.signInAsAdmin();
      createTestCollections();
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Move").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        cy.findByText("All personal collections").click();
        enterSearchText({
          text: "personal collection",
          placeholder: "Search…",
        });
        globalSearchTab().should("not.exist");
        localSearchTab("All personal collections").should("not.exist");
        assertSearchResults({
          foundItems: [
            "Admin personal collection 1",
            "Admin personal collection 2",
            "Normal personal collection 1",
            "Normal personal collection 2",
          ],
        });
      });
    });

    it("Should properly render a path from other users personal collections", () => {
      cy.signInAsAdmin();
      createTestCollections();
      cy.visit("/");
      H.newButton("Dashboard").click();

      H.modal().within(() => {
        cy.findByLabelText("Which collection should this go in?").click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        H.entityPickerModalItem(0, "All personal collections").click();
        H.entityPickerModalItem(
          1,
          "Robert Tableton's Personal Collection",
        ).click();
        H.entityPickerModalItem(2, "Normal personal collection 2").click();
        cy.button("Select").click();
      });

      cy.log(
        "Re-open the collection picker to ensure that the path is generated properly",
      );
      H.modal().within(() => {
        cy.findByLabelText("Which collection should this go in?").click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Collections").click();
        H.entityPickerModalItem(0, "All personal collections").should(
          "have.attr",
          "data-active",
          "true",
        );
        H.entityPickerModalItem(
          1,
          "Robert Tableton's Personal Collection",
        ).should("have.attr", "data-active", "true");
        H.entityPickerModalItem(2, "Normal personal collection 2").should(
          "have.attr",
          "data-active",
          "true",
        );
      });
    });
  });

  describe("dashboard picker", () => {
    it("should select a dashboard from local search results", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        enterSearchText({
          text: "dashboard",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select").click();
      });
      H.getDashboardCard(1).findByText("Orders, Count").should("be.visible");
    });

    it("should select a dashboard from global search results", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        enterSearchText({
          text: "dashboard",
          placeholder: "Search this collection or everywhere…",
        });
        selectGlobalSearchTab();
        cy.findByText("Orders in a dashboard").click();
        cy.button("Select").click();
      });
      H.getDashboardCard(1).findByText("Orders, Count").should("be.visible");
    });

    it("should search for dashboards for a normal user", () => {
      cy.signInAsAdmin();
      createTestDashboards();
      cy.signInAsNormalUser();
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      cy.log("root collection - automatically selected");
      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        enterSearchText({
          text: "dashboard 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Our analytics").should("be.checked");
        assertSearchResults({
          foundItems: ["Root dashboard 1"],
          notFoundItems: ["Root dashboard 2", "Regular dashboard 1"],
        });
        selectGlobalSearchTab();
        assertSearchResults({
          foundItems: ["Root dashboard 1", "Regular dashboard 1"],
        });
        selectLocalSearchTab("Our analytics");
        assertSearchResults({
          foundItems: ["Root dashboard 1"],
          notFoundItems: [
            "Root dashboard 2",
            "Regular dashboard 1",
            "Personal dashboard 1",
          ],
        });
      });

      cy.log("regular collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText("First collection").click();
        enterSearchText({
          text: "dashboard 2",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("First collection").should("be.checked");
        assertSearchResults({
          foundItems: ["Regular dashboard 2"],
          notFoundItems: [
            "Regular dashboard 1",
            "Root dashboard 2",
            "Personal dashboard 2",
          ],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal dashboard 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Robert Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["Normal personal dashboard 1"],
          notFoundItems: [
            "Normal personal dashboard 2",
            "Root dashboard 1",
            "Regular dashboard 1",
          ],
        });
      });
    });

    it("should search for dashboards when there is no access to the root collection", () => {
      cy.signInAsAdmin();
      createTestDashboards();
      cy.log("grant `nocollection` user access to `First collection`");
      cy.log("personal collections are always available");
      cy.updateCollectionGraph({
        [ALL_USERS_GROUP]: { [FIRST_COLLECTION_ID]: "write" },
      });
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: FIRST_COLLECTION_ID,
      });

      cy.signIn("nocollection");
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      cy.log("root collection");
      H.entityPickerModal().within(() => {
        cy.findByText("Collections").click();
        enterSearchText({
          text: "dashboard 1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Collections").should("be.checked");
        assertSearchResults({
          notFoundItems: [
            "Regular dashboard 1",
            "Regular dashboard 2",
            "Root dashboard 1",
            "No collection personal dashboard 1",
          ],
        });
        cy.findByText("Didn't find anything").should("be.visible");
        selectGlobalSearchTab();
        assertSearchResults({
          foundItems: [
            "Regular dashboard 1",
            "No collection personal dashboard 1",
          ],
        });
      });

      cy.log("personal collection");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText(/Personal Collection/).click();
        enterSearchText({
          text: "personal dashboard 2",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("No Collection Tableton's Personal Collection").should(
          "be.checked",
        );
        assertSearchResults({
          foundItems: ["No collection personal dashboard 2"],
          notFoundItems: [
            "No collection personal dashboard 1",
            "Root dashboard 2",
            "Admin personal dashboard 2",
            "Normal personal dashboard 2",
          ],
        });
      });
    });

    it("should not allow local search for `all personal collections`", () => {
      cy.signInAsAdmin();
      createTestDashboards();
      H.visitQuestion(ORDERS_QUESTION_ID);
      H.openQuestionActions();
      H.popover().findByText("Add to dashboard").click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Dashboards").click();
        cy.findByText("All personal collections").click();
        enterSearchText({
          text: "personal dashboard",
          placeholder: "Search…",
        });
        globalSearchTab().should("not.exist");
        localSearchTab("All personal collections").should("not.exist");
        assertSearchResults({
          foundItems: [
            "Admin personal dashboard 1",
            "Admin personal dashboard 2",
            "Normal personal dashboard 1",
            "Normal personal dashboard 2",
          ],
        });
      });
    });
  });
});

function createTestCards() {
  const types = ["question", "model", "metric"] as const;
  const suffixes = ["1", "2"];
  const collections = [
    { id: null, name: "Root" },
    { id: FIRST_COLLECTION_ID, name: "Regular" },
    { id: ADMIN_PERSONAL_COLLECTION_ID, name: "Admin personal collection" },
    { id: NORMAL_PERSONAL_COLLECTION_ID, name: "Normal personal collection" },
    {
      id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
      name: "No collection personal collection",
    },
  ];

  types.forEach(type => {
    suffixes.forEach(suffix => {
      collections.forEach(({ id, name }) => {
        H.createQuestion({
          ...cardDetails,
          name: `${name} ${type} ${suffix}`,
          type,
          collection_id: id,
        });
      });
    });
  });
}

function createTestCollections() {
  const suffixes = ["1", "2"];
  const collections = [
    {
      name: "Admin personal collection",
      parent_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal collection",
      parent_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal collection",
      parent_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  suffixes.forEach(suffix => {
    collections.forEach(collection =>
      H.createCollection({
        ...collection,
        name: `${collection.name} ${suffix}`,
      }),
    );
  });
}

function createTestDashboards() {
  const suffixes = ["1", "2"];
  const dashboards = [
    { name: "Root dashboard", collection_id: null },
    { name: "Regular dashboard", collection_id: FIRST_COLLECTION_ID },
    {
      name: "Admin personal dashboard",
      collection_id: ADMIN_PERSONAL_COLLECTION_ID,
    },
    {
      name: "Normal personal dashboard",
      collection_id: NORMAL_PERSONAL_COLLECTION_ID,
    },
    {
      name: "No collection personal dashboard",
      collection_id: NO_COLLECTION_PERSONAL_COLLECTION_ID,
    },
  ];

  suffixes.forEach(suffix => {
    dashboards.forEach(dashboard =>
      H.createDashboard({ ...dashboard, name: `${dashboard.name} ${suffix}` }),
    );
  });
}

function createTestDashboardWithEmptyCard(
  dashboardDetails: H.DashboardDetails = {},
) {
  const dashcardDetails: Partial<DashboardCard>[] = [
    {
      id: -1,
      card_id: null,
      dashboard_tab_id: null,
      row: 5,
      col: 0,
      size_x: 24,
      size_y: 1,
      visualization_settings: {
        virtual_card: {
          name: null,
          dataset_query: {},
          display: "placeholder",
          visualization_settings: {},
          archived: false,
        },
      },
      parameter_mappings: [],
    },
  ];

  return H.createDashboard(dashboardDetails).then(({ body: dashboard }) => {
    return H.updateDashboardCards({
      dashboard_id: dashboard.id,
      cards: dashcardDetails,
    }).then(() => dashboard);
  });
}

function selectQuestionFromDashboard(dashboardDetails?: H.DashboardDetails) {
  createTestDashboardWithEmptyCard(dashboardDetails).then(dashboard => {
    H.visitDashboard(dashboard.id);
    H.editDashboard();
    H.getDashboardCard().button("Select question").click();
  });
}

function enterSearchText({
  text,
  placeholder,
}: {
  text: string;
  placeholder: string;
}) {
  cy.findByPlaceholderText(placeholder).clear().type(text);
}

function existingSearchTab() {
  return cy.findByText(/results? for/);
}

function globalSearchTab() {
  return cy.findByLabelText("Everywhere");
}

function selectGlobalSearchTab() {
  cy.findByText("Everywhere").click();
}

function localSearchTab(selectedItem: string) {
  return cy.findByLabelText(`“${selectedItem}”`);
}

function selectLocalSearchTab(selectedItem: string) {
  cy.findByText(`“${selectedItem}”`).click();
}

function assertSearchResults({
  totalFoundItemsCount,
  foundItems = [],
  notFoundItems = [],
}: {
  foundItems?: string[];
  notFoundItems?: string[];
  totalFoundItemsCount?: number;
}) {
  foundItems.forEach(item => {
    cy.findByText(item).should("be.visible");
  });

  notFoundItems.forEach(item => {
    cy.findByText(item).should("not.exist");
  });

  if (totalFoundItemsCount != null) {
    const foundItemsCountMessage =
      totalFoundItemsCount === 1
        ? `${totalFoundItemsCount} result`
        : `${totalFoundItemsCount} results`;
    cy.findByTestId("entity-picker-search-result-count").should(
      "have.text",
      foundItemsCountMessage,
    );
  }
}

function testCardSearchForNormalUser({ tabs }: { tabs: string[] }) {
  tabs.forEach(tab => {
    cy.log("root collection - automatically selected");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      enterSearchText({
        text: "2",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("Our analytics").should("be.checked");
      assertSearchResults({
        foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
        notFoundItems: [
          "Root question 1",
          "Regular question 2",
          "Admin personal collection question 2",
          "Normal personal collection question 2",
        ],
      });
    });

    cy.log("regular collection");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText("First collection").click();
      enterSearchText({
        text: "1",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("First collection").should("be.checked");
      assertSearchResults({
        foundItems: [
          "Regular question 1",
          "Regular model 1",
          "Regular metric 1",
        ],
        notFoundItems: [
          "Root question 1",
          "Regular question 2",
          "Admin personal collection question 1",
          "Normal personal collection question 1",
        ],
      });
    });

    cy.log("root collection - manually selected");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText("Our analytics").click();
      enterSearchText({
        text: "2",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("Our analytics").should("be.checked");
      assertSearchResults({
        foundItems: ["Root question 2", "Root model 2", "Root metric 2"],
        notFoundItems: [
          "Root model 1",
          "Regular model 2",
          "Admin personal collection model 2",
          "Normal personal collection model 2",
        ],
      });
    });

    cy.log("personal collection");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText(/Personal Collection/).click();
      enterSearchText({
        text: "1",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("Robert Tableton's Personal Collection").should(
        "be.checked",
      );
      assertSearchResults({
        foundItems: [
          "Normal personal collection question 1",
          "Normal personal collection model 1",
          "Normal personal collection metric 1",
        ],
        notFoundItems: [
          "Root metric 1",
          "Regular metric 1",
          "Admin personal collection metric 1",
          "Normal personal collection metric 2",
        ],
      });
    });
  });
}

function testCardSearchForInaccessibleRootCollection({
  tabs,
  isRootSelected,
}: {
  tabs: string[];
  isRootSelected: boolean;
}) {
  tabs.forEach(tab => {
    if (isRootSelected) {
      cy.log("inaccessible root collection - automatically selected");
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab(tab).click();
        enterSearchText({
          text: "1",
          placeholder: "Search this collection or everywhere…",
        });
        localSearchTab("Collections").should("be.checked");
        assertSearchResults({
          notFoundItems: [
            "Root metric 1",
            "Regular metric 1",
            "Admin personal collection metric 1",
            "Normal personal collection metric 2",
          ],
        });
        cy.findByText("Didn't find anything").should("be.visible");
      });
    }

    cy.log("regular collection");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText("First collection").click();
      enterSearchText({
        text: "1",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("First collection").should("be.checked");
      assertSearchResults({
        foundItems: [
          "Regular question 1",
          "Regular model 1",
          "Regular metric 1",
        ],
        notFoundItems: [
          "Root question 1",
          "Regular question 2",
          "Admin personal collection question 1",
          "Normal personal collection question 1",
          "No collection personal collection question 1",
        ],
      });
    });

    cy.log("inaccessible root collection - manually selected");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText("Collections").click();
      enterSearchText({
        text: "1",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("Collections").should("be.checked");
      assertSearchResults({
        notFoundItems: [
          "Root metric 1",
          "Regular metric 1",
          "Admin personal collection metric 1",
          "Normal personal collection metric 2",
        ],
      });
      cy.findByText("Didn't find anything").should("be.visible");
    });

    cy.log("personal collection");
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText(/Personal Collection/).click();
      enterSearchText({
        text: "1",
        placeholder: "Search this collection or everywhere…",
      });
      localSearchTab("No Collection Tableton's Personal Collection").should(
        "be.checked",
      );
      assertSearchResults({
        foundItems: [
          "No collection personal collection question 1",
          "No collection personal collection model 1",
          "No collection personal collection metric 1",
        ],
        notFoundItems: [
          "Root metric 1",
          "Regular metric 1",
          "Admin personal collection metric 1",
          "Normal personal collection metric 2",
        ],
      });
    });
  });
}

function testCardSearchForAllPersonalCollections({ tabs }: { tabs: string[] }) {
  tabs.forEach(tab => {
    H.entityPickerModal().within(() => {
      H.entityPickerModalTab(tab).click();
      cy.findByText("All personal collections").click();
      enterSearchText({
        text: "root",
        placeholder: "Search…",
      });
      globalSearchTab().should("not.exist");
      localSearchTab("All personal collections").should("not.exist");
      assertSearchResults({
        foundItems: ["Root question 1", "Root model 1", "Root metric 1"],
      });
    });
  });
}

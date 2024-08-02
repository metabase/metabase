import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_COUNT_QUESTION_ID,
  SECOND_COLLECTION_ID,
  THIRD_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  openOrdersTable,
  tabsShouldBe,
  popover,
  restore,
  visualize,
  startNewQuestion,
  visitQuestionAdhoc,
  saveQuestion,
  getPersonalCollectionName,
  visitCollection,
  queryBuilderHeader,
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalTab,
  collectionOnTheGoModal,
  modal,
  pickEntity,
  visitQuestion,
  tableHeaderClick,
  onlyOnOSS,
  createQuestion,
  openNotebook,
  notebookButton,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  describe("data picker", () => {
    it("data selector popover should not be too small (metabase#15591)", () => {
      // Add 10 more databases
      for (let i = 0; i < 10; i++) {
        cy.addSQLiteDatabase({ name: "Sample" + i });
      }

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Sample3").should("be.visible");
      });
    });

    it("new question data picker search should work for both saved questions and database tables", () => {
      cy.intercept("GET", "/api/search?q=*", cy.spy().as("searchQuery")).as(
        "search",
      );

      startNewQuestion();

      entityPickerModal().within(() => {
        tabsShouldBe("Models", ["Models", "Tables", "Saved questions"]);

        entityPickerModalTab("Search").should("not.exist");

        cy.findByPlaceholderText("Search…").type("  ").blur();
        cy.findByPlaceholderText("Search…").type("ord");
        cy.wait("@search");
        // should not trigger search for an empty string
        cy.get("@searchQuery").should("have.been.calledOnce");

        cy.findAllByTestId("result-item").should("have.length.at.least", 4);

        const searchResultItems = cy.findAllByTestId("result-item");

        searchResultItems.then($results => {
          const types = $results
            .toArray()
            .map(element => element.getAttribute("data-model-type"));

          // Search results include both saved questions and database tables
          expect(types).to.include("card");
          expect(types).to.include("dataset");
          expect(types).to.include("table");
        });

        // Discarding the search query should take us back to the original tab
        cy.findByPlaceholderText("Search…").clear().blur();
        entityPickerModalTab("Search").should("not.exist");
        tabsShouldBe("Models", ["Models", "Tables", "Saved questions"]);

        entityPickerModalTab("Saved questions").click();
        cy.findByText("Orders, Count").click();
      });

      cy.log("toggle notebook button should be hidden for brand new questions");
      notebookButton().should("not.exist");

      visualize();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("18,760");
      // should reopen saved question picker after returning back to editor mode
      openNotebook();

      notebookButton().should("be.visible");

      cy.findByTestId("data-step-cell").contains("Orders, Count").click();
      entityPickerModal().within(() => {
        // It is now possible to choose another saved question
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        cy.findByText("Orders").should("exist");
        cy.findByText("Orders, Count").should("exist");

        entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      cy.findByTestId("data-step-cell").contains("Products");
      visualize();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Rustic Paper Wallet");
    });

    it("should suggest questions saved in collections with colon in their name (metabase#14287)", () => {
      cy.request("POST", "/api/collection", {
        name: "foo:bar",
        parent_id: null,
      }).then(({ body: { id: COLLECTION_ID } }) => {
        // Move question #1 ("Orders") to newly created collection
        cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
          collection_id: COLLECTION_ID,
        });
        // Sanity check: make sure Orders is indeed inside new collection
        cy.visit(`/collection/${COLLECTION_ID}`);
        cy.findByText("Orders");
      });

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        // Note: collection name's first letter is capitalized
        cy.findByText(/foo:bar/i).click();
        cy.findByText("Orders");
      });
    });

    it("'Saved Questions' prompt should respect nested collections structure (metabase#14178)", () => {
      // Move first question in a DB snapshot ("Orders") to a "Second collection"
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        collection_id: SECOND_COLLECTION_ID,
      });

      startNewQuestion();

      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        assertDataPickerEntitySelected(0, "Our analytics");
        cy.findByText("First collection").should("exist");
        cy.findByText("Second collection").should("not.exist");
        cy.findByText("Third collection").should("not.exist");

        cy.findByText("First collection").click();
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        cy.findByText("Second collection").should("exist");
        cy.findByText("Third collection").should("not.exist");

        cy.findByText("Second collection").click();
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Second collection");
        cy.findByText("Third collection").should("not.exist");
      });
    });

    it("should be possible to create a question based on a question in another user personal collection", () => {
      cy.signOut();
      cy.signIn("nocollection");
      startNewQuestion();
      entityPickerModal().findByText("Orders").click();
      visualize();
      saveQuestion("Personal question");

      cy.signOut();
      cy.signInAsAdmin();
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        cy.findByText("All personal collections").click();
        cy.findByText(getPersonalCollectionName(USERS.nocollection)).click();
        cy.findByText("Personal question").click();
      });
      visualize();
    });
  });

  it("composite keys should act as filters on click (metabase#13717)", () => {
    cy.request("PUT", `/api/field/${ORDERS.QUANTITY}`, {
      semantic_type: "type/PK",
    });

    openOrdersTable();

    cy.get(".test-TableInteractive-cellWrapper--lastColumn") // Quantity (last in the default order for Sample Database)
      .eq(1) // first table body cell
      .should("contain", "2"); // quantity for order ID#1

    // Test was flaky due to long chain.
    cy.get(".test-TableInteractive-cellWrapper--lastColumn").eq(1).click();
    cy.wait("@dataset");

    cy.get(
      "#main-data-grid .test-TableInteractive-cellWrapper--firstColumn",
    ).should("have.length.gt", 1);

    cy.log(
      "**Reported at v0.34.3 - v0.37.0.2 / probably was always like this**",
    );
    cy.log(
      "**It should display the table with all orders with the selected quantity.**",
    );
    cy.get(".test-TableInteractive");

    cy.get(".test-TableInteractive-cellWrapper--firstColumn") // ID (first in the default order for Sample Database)
      .eq(1) // first table body cell
      .should("contain", 1)
      .click();
    cy.wait("@dataset");

    cy.log("only one row should appear after filtering by ID");
    cy.get(
      "#main-data-grid .test-TableInteractive-cellWrapper--firstColumn",
    ).should("have.length", 1);
  });

  it("should handle ad-hoc question with old syntax (metabase#15372)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: ["=", ["field-id", ORDERS.USER_ID], 1],
        },
        database: SAMPLE_DB_ID,
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("User ID is 1");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("37.65");
  });

  it("should suggest the currently viewed collection when saving question", () => {
    visitCollection(THIRD_COLLECTION_ID);

    cy.findByLabelText("Navigation bar").within(() => {
      cy.findByText("New").click();
    });

    popover().findByText("Question").click();

    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText("Orders").click();
    });

    cy.findByTestId("qb-header").within(() => {
      cy.findByText("Save").click();
    });
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByLabelText(/Which collection/).should(
        "have.text",
        "Third collection",
      );
    });
  });

  it(
    "should be able to save a question to a collection created on the go",
    { tags: "@smoke" },
    () => {
      visitCollection(THIRD_COLLECTION_ID);

      cy.findByLabelText("Navigation bar").findByText("New").click();
      popover().findByText("Question").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cy.findByTestId("qb-header").findByText("Save").click();

      cy.log("should be able to tab through fields (metabase#41683)");
      cy.realPress("Tab").realPress("Tab");
      cy.findByLabelText("Description").should("be.focused");

      cy.findByTestId("save-question-modal")
        .findByLabelText(/Which collection/)
        .click();

      entityPickerModal()
        .findByRole("tab", { name: /Collections/ })
        .click();

      entityPickerModal().findByText("Create a new collection").click();

      const NEW_COLLECTION = "Foo";
      collectionOnTheGoModal().within(() => {
        cy.findByLabelText(/Give it a name/).type(NEW_COLLECTION);
        cy.findByText("Create").click();
      });
      entityPickerModal().within(() => {
        cy.findByText("Foo").click();
        cy.findByText("Select").click();
      });
      cy.findByTestId("save-question-modal").within(() => {
        cy.findByText("Save new question");
        cy.findByLabelText(/Which collection/).should(
          "have.text",
          NEW_COLLECTION,
        );
        cy.findByText("Save").click();
      });

      cy.get("header").findByText(NEW_COLLECTION);
    },
  );

  it("should preserve the original question name (metabase#41196)", () => {
    const originalQuestionName = "Foo";
    const modifiedQuestionName = `${originalQuestionName} - Modified`;
    const originalDescription = "Lorem ipsum dolor sit amet";

    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      name: originalQuestionName,
      description: originalDescription,
    });

    visitQuestion(ORDERS_COUNT_QUESTION_ID);
    cy.findByDisplayValue(originalQuestionName).should("exist");

    cy.log("Change anything about this question to make it dirty");
    tableHeaderClick("Count");
    popover().icon("arrow_down").click();

    cy.findByTestId("qb-header-action-panel").button("Save").click();
    cy.findByTestId("save-question-modal").within(() => {
      cy.findByText("Save as new question").click();

      cy.findByLabelText("Name").should("have.value", modifiedQuestionName);
      cy.findByLabelText("Description").should(
        "have.value",
        originalDescription,
      );
    });
  });

  describe("add to a dashboard", () => {
    const collectionInRoot = {
      name: "Collection in root collection",
    };
    const dashboardInRoot = {
      name: "Dashboard in root collection",
    };
    const myPersonalCollectionName = "Bobby Tables's Personal Collection";

    beforeEach(() => {
      cy.intercept("POST", "/api/card").as("createQuestion");
      cy.createCollection(collectionInRoot);
      cy.createDashboard(dashboardInRoot);
      // Can't use `startNewQuestion` because it's missing `display: "table"` and
      // adding that will fail a lot of other tests and I don't want to deal with that yet.
      cy.visit("/");
      cy.findByTestId("app-bar").button("New").click();
      popover().findByText("Question").click();
    });

    it("should hide public collections when selecting a dashboard for a question in a personal collection", () => {
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });

      queryBuilderHeader().button("Save").click();
      cy.findByTestId("save-question-modal")
        .findByLabelText(/Which collection/)
        .click();

      pickEntity({
        path: [myPersonalCollectionName],
        select: true,
        tab: "Collections",
      });

      cy.findByTestId("save-question-modal").button("Save").click();
      cy.wait("@createQuestion");

      cy.findByTestId("save-question-modal").should("not.exist");

      modal().within(() => {
        cy.findByText(/add this to a dashboard/i);
        cy.button("Yes please!").click();
      });

      entityPickerModal().within(() => {
        cy.findByText("Add this question to a dashboard").should("be.visible");
        entityPickerModalTab("Dashboards").click();
        cy.findByText(/bobby tables's personal collection/i).should(
          "be.visible",
        );
        cy.findByText(/our analytics/i).should("not.exist");
      });
    });

    it("should show all collections when selecting a dashboard for a question in a public collection", () => {
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });

      queryBuilderHeader().button("Save").click();
      cy.log("default selected collection is the root collection");

      cy.findByTestId("save-question-modal").within(modal => {
        cy.findByText("Save").click();
        cy.wait("@createQuestion");
      });

      cy.get("#QuestionSavedModal").within(() => {
        cy.findByText("Yes please!").click();
      });

      entityPickerModal().within(() => {
        cy.findByText("Add this question to a dashboard").should("be.visible");

        cy.findByRole("tab", { name: /Dashboards/ }).click();
        cy.findByText("Bobby Tables's Personal Collection").should(
          "be.visible",
        );
        cy.findByText(collectionInRoot.name).should("be.visible");
        cy.findByText(dashboardInRoot.name).should("be.visible");
        cy.findByText("Create a new dashboard").should("be.visible");
      });
    });
  });
});

// the data picker has different behavior if there are no models in the instance
// the default instance image has a model in it, so we need to separately test the
// model-less behavior
describe(
  "scenarios > question > new > data picker > without models",
  { tags: ["@OSS", "@smoke"] },
  () => {
    beforeEach(() => {
      onlyOnOSS();
      restore("without-models");
      cy.signInAsAdmin();
    });

    it("can create a question from the sample database", () => {
      cy.visit("/question/new");

      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should("be.visible");
        entityPickerModalTab("Models").should("not.exist");
        entityPickerModalTab("Tables").click();

        entityPickerModalItem(2, "Products").click();
      });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByText("Rustic Paper Wallet").should("be.visible");
      });
    });

    it("can create a question from a saved question", () => {
      cy.visit("/question/new");

      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        entityPickerModalItem(1, "Orders").click();
      });

      // strange: we get different behavior when we go to question/new
      cy.findAllByTestId("run-button").first().click();

      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByText(39.72).should("be.visible");
      });
    });

    it("shows models and raw data options after creating a model", () => {
      createQuestion({
        name: "Orders Model",
        query: { "source-table": ORDERS_ID },
        type: "model",
      });

      cy.visit("/question/new");

      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should("be.visible");
        entityPickerModalTab("Models").should("be.visible");
        entityPickerModalTab("Tables").should("be.visible");
      });
    });
  },
);

function assertDataPickerEntitySelected(level, name) {
  entityPickerModalItem(level, name).should("have.attr", "data-active", "true");
}

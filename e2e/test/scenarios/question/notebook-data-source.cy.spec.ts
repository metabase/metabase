import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  createCollection,
  createQuestion,
  entityPickerModal,
  entityPickerModalItem,
  entityPickerModalLevel,
  entityPickerModalTab,
  join,
  navigationSidebar,
  newButton,
  onlyOnOSS,
  openNotebook,
  openOrdersTable,
  openQuestionActions,
  openReviewsTable,
  popover,
  queryBuilderMain,
  resetTestTable,
  restore,
  resyncDatabase,
  saveQuestion,
  shouldDisplayTabs,
  startNewQuestion,
  tabsShouldBe,
  visitModel,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";
import { checkNotNull } from "metabase/lib/types";

const { ORDERS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      restore("setup");
      cy.signInAsAdmin();
    });

    it(
      "should display tables from the only existing database by default",
      { tags: "@OSS" },
      () => {
        onlyOnOSS();
        cy.visit("/");
        cy.findByTestId("app-bar").findByText("New").click();
        popover().findByTextEnsureVisible("Question").click();
        cy.findByTestId("data-step-cell").should(
          "have.text",
          "Pick your starting data",
        );

        entityPickerModal().within(() => {
          cy.log("Should not have Recents tab");
          cy.findAllByRole("tab").should("have.length", 0);

          entityPickerModalLevel(0).should("not.exist");
          entityPickerModalLevel(1).should("not.exist");
          entityPickerModalLevel(2)
            .get("[data-index]")
            .should("have.length", 8);
          assertDataPickerEntityNotSelected("Accounts", { level: 2 });
          assertDataPickerEntityNotSelected("Analytic Events", { level: 2 });
          assertDataPickerEntityNotSelected("Feedback", { level: 2 });
          assertDataPickerEntityNotSelected("Invoices", { level: 2 });
          assertDataPickerEntityNotSelected("Orders", { level: 2 });
          assertDataPickerEntityNotSelected("People", { level: 2 });
          assertDataPickerEntityNotSelected("Products", { level: 2 });
          assertDataPickerEntityNotSelected("Reviews", { level: 2 });
        });
      },
    );

    it("should not show saved questions if only models exist (metabase#25142)", () => {
      createQuestion({
        name: "GUI Model",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
        type: "model",
      });

      startNewQuestion();
      entityPickerModal().within(() => {
        cy.findAllByRole("tab").should("have.length", 2);
        entityPickerModalTab("Models").should("exist");
        entityPickerModalTab("Tables").should("exist");
        entityPickerModalTab("Saved questions").should("not.exist");
      });
    });

    it("should not show models if only saved questions exist", () => {
      createQuestion({
        name: "GUI Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
      });

      startNewQuestion();

      entityPickerModal().within(() => {
        shouldDisplayTabs(["Tables", "Saved questions"]);
        entityPickerModalTab("Models").should("not.exist");
      });
    });
  });

  describe("table as a source", () => {
    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("should correctly display the source data for ad-hoc questions", () => {
      openReviewsTable();
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Reviews").click();
      entityPickerModal().within(() => {
        tabsShouldBe("Tables", ["Models", "Tables", "Saved questions"]);
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected("Reviews", { level: 2 });
      });
    });

    it("should correctly display the source data for a simple saved question", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      entityPickerModal().within(() => {
        tabsShouldBe("Tables", ["Models", "Tables", "Saved questions"]);
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected("Orders", { level: 2 });
      });
    });

    it(
      "should correctly display a table from a multi-schema database (metabase#39807,metabase#11958)",
      { tags: "@external" },
      () => {
        const dialect = "postgres";
        const testTable1 = "multi_schema";
        const testTable2 = "many_data_types";

        const dbName = "Writable Postgres12";
        const schemaName = "Wild";
        const tableName = "Animals";

        resetTestTable({ type: dialect, table: testTable1 });
        resetTestTable({ type: dialect, table: testTable2 });
        restore(`${dialect}-writable`);

        cy.signInAsAdmin();

        resyncDatabase({
          dbId: WRITABLE_DB_ID,
        });

        startNewQuestion();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          entityPickerModalItem(dbName).click();
          entityPickerModalItem(schemaName).click();
          entityPickerModalItem(tableName).click();
        });
        visualize();
        saveQuestion("Beasts");

        openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        entityPickerModal().within(() => {
          assertDataPickerEntitySelected(dbName, { level: 0 });
          assertDataPickerEntitySelected(schemaName, { level: 1 });
          assertDataPickerEntitySelected(tableName, { level: 2 });

          entityPickerModalTab("Recents").click();
          entityPickerModalItem(tableName)
            .should("be.visible")
            .and("have.attr", "aria-selected", "true");

          entityPickerModalTab("Tables").click();
          entityPickerModalItem(dbName).click();
          entityPickerModalItem(schemaName).click();
          entityPickerModalItem(tableName).click();
        });

        cy.log("select a table from the second schema");
        join();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          entityPickerModalItem("Public").click();
          entityPickerModalItem("Many Data Types").click();
        });
        popover().findByText("Name").click();
        popover().findByText("Text").click();

        cy.log("select a table from the third schema");
        join();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          entityPickerModalItem("Domestic").click();
          entityPickerModalItem("Animals").click();
        });
        popover().findByText("Name").click();
        popover().findByText("Name").click();
      },
    );

    it("should correctly display a table as the model's source when editing simple model's query", () => {
      cy.visit(`/model/${ORDERS_MODEL_ID}/query`);

      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected("Orders", { level: 2 });
      });
    });
  });

  describe("saved entity as a source (aka the virtual table)", () => {
    const modelDetails: StructuredQuestionDetails = {
      name: "GUI Model",
      query: { "source-table": REVIEWS_ID, limit: 1 },
      display: "table",
      type: "model",
      collection_id: SECOND_COLLECTION_ID,
    };

    beforeEach(() => {
      restore();
      cy.signInAsAdmin();
    });

    it("data selector should properly show a model as the source (metabase#39699)", () => {
      createQuestion(modelDetails, { visitQuestion: true });
      openNotebook();
      cy.findByTestId("data-step-cell")
        .should("have.text", modelDetails.name)
        .click();

      entityPickerModal().within(() => {
        shouldDisplayTabs(["Models", "Tables", "Saved questions"]);

        assertDataPickerEntitySelected("Our analytics", { level: 0 });
        assertDataPickerEntitySelected("First collection", { level: 1 });
        assertDataPickerEntitySelected("Second collection", { level: 2 });
        assertDataPickerEntitySelected(checkNotNull(modelDetails.name), {
          level: 3,
        });

        entityPickerModalItem(checkNotNull(modelDetails.name)).should(
          "be.visible",
        );
      });
    });

    it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
      visitModel(ORDERS_MODEL_ID);
      openNotebook();

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected("Our analytics", { level: 0 });
        assertDataPickerEntitySelected("Orders Model", { level: 1 });

        cy.button("Close").click();
      });

      moveToCollection("First collection");

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected("Our analytics", { level: 0 });
        assertDataPickerEntitySelected("First collection", { level: 1 });
        assertDataPickerEntitySelected("Orders Model", { level: 2 });
      });
    });

    it("moving the source question should immediately reflect in the data selector for the nested question that depends on it (metabase#39812-2)", () => {
      const SOURCE_QUESTION_ID = ORDERS_COUNT_QUESTION_ID;
      // Rename the source question to make assertions more explicit
      const sourceQuestionName = "Source Question";
      cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
        name: sourceQuestionName,
      });

      const nestedQuestionDetails = {
        name: "Nested Question",
        query: { "source-table": `card__${SOURCE_QUESTION_ID}` },
      };

      createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });

      cy.log("see nested question in our analytics");

      visitQuestion("@nestedQuestionId");
      openNotebook();
      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected("Our analytics", { level: 0 });
        assertDataPickerEntitySelected(sourceQuestionName, { level: 1 });

        cy.button("Close").click();
      });

      cy.log("Move the source question to another collection");
      visitQuestion(SOURCE_QUESTION_ID);
      openNotebook();
      moveToCollection("First collection");

      cy.log("Make sure the source change is reflected in a nested question");
      visitQuestion("@nestedQuestionId");
      openNotebook();

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected("Our analytics", { level: 0 });
        assertDataPickerEntitySelected("First collection", { level: 1 });
        assertDataPickerEntitySelected(sourceQuestionName), { level: 2 };
      });
    });
  });
});

describe("scenarios > notebook > data source", { tags: "@OSS" }, () => {
  beforeEach(() => {
    onlyOnOSS();
    restore("setup");
    cy.signInAsAdmin();
  });

  it("should not show saved questions if only models exist (metabase#25142)", () => {
    createQuestion({
      name: "GUI Model",
      query: { "source-table": REVIEWS_ID, limit: 1 },
      display: "table",
      type: "model",
    });
    startNewQuestion();
    entityPickerModal().within(() => {
      cy.findAllByRole("tab").should("have.length", 2);
      entityPickerModalTab("Tables").should("be.visible");
      entityPickerModalTab("Models").should("be.visible");
      entityPickerModalTab("Saved questions").should("not.exist");
    });
  });
});

describe("issue 34350", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("works after changing question's source table to a one from a different database (metabase#34350)", () => {
    openOrdersTable({ mode: "notebook" });
    openDataSelector();
    entityPickerModal().within(() => {
      entityPickerModalItem("QA Postgres12").click();
      entityPickerModalItem("Orders").click();
    });

    visualize();

    queryBuilderMain()
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.findAllByTestId("cell-data").should("contain", "37.65");
  });
});

describe("issue 28106", () => {
  beforeEach(() => {
    const dialect = "postgres";

    resetTestTable({ type: dialect, table: "many_schemas" });
    restore(`${dialect}-writable`);
    cy.signInAsAdmin();

    resyncDatabase({ dbId: WRITABLE_DB_ID });
  });

  it(
    "should not jump to the top of schema list when scrolling (metabase#28106)",
    { tags: "@external" },
    () => {
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        entityPickerModalItem("Writable Postgres12").click();

        entityPickerModalLevel(1)
          .findByTestId("scroll-container")
          .as("schemasList");

        // The list is virtualized and the scrollbar height changes during scrolling (metabase#44966)
        // that's why we need to scroll and wait multiple times.
        // Test is flaky because of this - that's why there are 3 attempts.
        for (let i = 0; i < 3; ++i) {
          cy.get("@schemasList").scrollTo("bottom");
          cy.wait(100);
        }

        // assert scrolling worked and the last item is visible
        entityPickerModalItem("Public", { level: 1 }).should("be.visible");

        // simulate scrolling up using mouse wheel 3 times
        for (let i = 0; i < 3; ++i) {
          cy.get("@schemasList").realMouseWheel({ deltaY: -100 });
          cy.wait(100);
        }

        // assert first item does not exist - this means the list has not been scrolled to the top
        cy.findByText("Domestic").should("not.exist");
        cy.get("@schemasList").should(([$element]) => {
          expect($element.scrollTop).to.be.greaterThan(0);
        });
      });
    },
  );
});

describe("issue 32252", () => {
  beforeEach(() => {
    restore("setup");
    cy.signInAsAdmin();

    createCollection({ name: "My collection" }).then(({ body: collection }) => {
      if (typeof collection.id !== "number") {
        throw new Error("collection.id is not a number");
      }

      createQuestion({
        name: "My question",
        collection_id: collection.id,
        query: {
          "source-table": ORDERS_ID,
        },
      });
    });
  });

  it("refreshes data picker sources after archiving a collection (metabase#32252)", () => {
    cy.visit("/");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      entityPickerModalTab("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    cy.button("Actions").click();
    popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed collection")
      .should("be.visible");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      entityPickerModalItem("Orders").should("be.visible");
    });
  });

  it("refreshes data picker sources after archiving a question (metabase#32252)", () => {
    cy.visit("/");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      entityPickerModalTab("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    cy.findByTestId("collection-entry-name").click();
    cy.button("Actions").click();
    popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed question")
      .should("be.visible");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      entityPickerModalItem("Orders").should("be.visible");
    });
  });
});

function moveToCollection(collection: string) {
  cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");

  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();

  entityPickerModal().within(() => {
    entityPickerModalItem(collection).click();
    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertDataPickerEntitySelected(
  name: string,
  options?: { level?: number },
) {
  entityPickerModalItem(name, options).should(
    "have.attr",
    "data-active",
    "true",
  );
}

function assertDataPickerEntityNotSelected(
  name: string,
  options?: { level?: number },
) {
  entityPickerModalItem(name, options).should("not.have.attr", "data-active");
}

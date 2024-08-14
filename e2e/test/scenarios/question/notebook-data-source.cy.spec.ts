import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
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
  startNewQuestion,
  visitModel,
  visitQuestion,
  visualize,
  type StructuredQuestionDetails,
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
          assertDataPickerEntityNotSelected(2, "Accounts");
          assertDataPickerEntityNotSelected(2, "Analytic Events");
          assertDataPickerEntityNotSelected(2, "Feedback");
          assertDataPickerEntityNotSelected(2, "Invoices");
          assertDataPickerEntityNotSelected(2, "Orders");
          assertDataPickerEntityNotSelected(2, "People");
          assertDataPickerEntityNotSelected(2, "Products");
          assertDataPickerEntityNotSelected(2, "Reviews");
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
        entityPickerModalTab("Recents").should("not.exist");
        entityPickerModalTab("Models").and(
          "have.attr",
          "aria-selected",
          "true",
        );
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
        cy.findAllByRole("tab").should("have.length", 2);
        entityPickerModalTab("Recents").should("not.exist");
        entityPickerModalTab("Models").should("not.exist");
        entityPickerModalTab("Tables").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        entityPickerModalTab("Saved questions").should("exist");
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
        entityPickerModalTab("Recents").should("exist");
        entityPickerModalTab("Tables").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Reviews");
      });
    });

    it("should correctly display the source data for a simple saved question", () => {
      visitQuestion(ORDERS_COUNT_QUESTION_ID);
      openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Recents").should("exist");
        entityPickerModalTab("Tables").and(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Orders");
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
          entityPickerModalTab("Recents").should("not.exist");
          entityPickerModalTab("Tables").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });
        visualize();
        saveQuestion("Beasts");

        openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        entityPickerModal().within(() => {
          assertDataPickerEntitySelected(0, dbName);
          assertDataPickerEntitySelected(1, schemaName);
          assertDataPickerEntitySelected(2, tableName);

          entityPickerModalTab("Recents").click();
          cy.findByTestId("result-item")
            .should("exist")
            .and("contain.text", tableName)
            .and("have.attr", "aria-selected", "true");

          entityPickerModalTab("Tables").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });

        cy.log("select a table from the second schema");
        join();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          cy.findByText("Public").click();
          cy.findByText("Many Data Types").click();
        });
        popover().findByText("Name").click();
        popover().findByText("Text").click();

        cy.log("select a table from the third schema");
        join();
        entityPickerModal().within(() => {
          entityPickerModalTab("Tables").click();
          cy.findByText("Domestic").click();
          cy.findByText("Animals").click();
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
        assertDataPickerEntitySelected(2, "Orders");
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
        entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Second collection");
        assertDataPickerEntitySelected(3, checkNotNull(modelDetails.name));

        entityPickerModalTab("Recents").click();
        cy.findByTestId("result-item")
          .should("exist")
          .and("contain.text", checkNotNull(modelDetails.name))
          .and("have.attr", "aria-selected", "true");
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
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "Orders Model");

        entityPickerModalTab("Recents").click();
        cy.findByTestId("result-item")
          .should("exist")
          .and("contain.text", "Orders Model")
          .and("have.attr", "aria-selected", "true");

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
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Orders Model");

        entityPickerModalTab("Recents").click();
        cy.findByTestId("result-item")
          .should("exist")
          .and("contain.text", "Orders Model")
          .and("have.attr", "aria-selected", "true");
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

      visitQuestion("@nestedQuestionId");
      openNotebook();

      openDataSelector();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, sourceQuestionName);

        entityPickerModalTab("Recents").click();
        cy.findAllByTestId("result-item").should("have.length", 1);
        cy.findByTestId("result-item")
          .should("exist")
          .and("contain.text", "Nested Question")
          .and("not.have.attr", "aria-selected", "true");

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
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, sourceQuestionName);

        entityPickerModalTab("Recents").click();
        cy.findAllByTestId("result-item")
          .contains(nestedQuestionDetails.name)
          .parents("button")
          .and("not.have.attr", "aria-selected", "true");
        cy.findAllByTestId("result-item")
          .contains(sourceQuestionName)
          .parents("button")
          .and("have.attr", "aria-selected", "true");
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
      entityPickerModalTab("Recents").should("not.exist");
      entityPickerModalTab("Models").and("have.attr", "aria-selected", "true");
      entityPickerModalTab("Tables").should("exist");
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
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
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
        cy.findByText("Writable Postgres12").click();

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
        entityPickerModalItem(1, "Public").should("be.visible");

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
      cy.findByText("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    cy.button("Actions").click();
    popover().findByText("Archive").click();
    cy.findByTestId("toast-undo")
      .findByText("Archived collection")
      .should("be.visible");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("refreshes data picker sources after archiving a question (metabase#32252)", () => {
    cy.visit("/");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    navigationSidebar().findByText("Our analytics").click();

    cy.findByTestId("collection-entry-name").click();
    cy.button("Actions").click();
    popover().findByText("Archive").click();
    cy.findByTestId("toast-undo")
      .findByText("Archived question")
      .should("be.visible");

    newButton("Question").click();
    entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      cy.findByText("Orders").should("be.visible");
    });
  });
});

function moveToCollection(collection: string) {
  cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");

  openQuestionActions();
  popover().findByTextEnsureVisible("Move").click();

  entityPickerModal().within(() => {
    cy.findByText(collection).click();
    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertDataPickerEntitySelected(level: number, name: string) {
  entityPickerModalItem(level, name).should("have.attr", "data-active", "true");
}

function assertDataPickerEntityNotSelected(level: number, name: string) {
  entityPickerModalItem(level, name).should("not.have.attr", "data-active");
}

const { H } = cy;
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import { checkNotNull } from "metabase/lib/types";

const { ORDERS_ID, PRODUCTS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
    });

    it("should display databases by default", { tags: "@OSS" }, () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      H.popover().findByTextEnsureVisible("Question").click();
      cy.findByPlaceholderText("Search for tables and more...").should("exist");

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        // databases is selected already
        H.entityPickerModalLevel(1).findByText("Sample Database").click();
        assertDataPickerEntityNotSelected(3, "Accounts");
        assertDataPickerEntityNotSelected(3, "Analytic Events");
        assertDataPickerEntityNotSelected(3, "Feedback");
        assertDataPickerEntityNotSelected(3, "Invoices");
        assertDataPickerEntityNotSelected(3, "Orders");
        assertDataPickerEntityNotSelected(3, "People");
        assertDataPickerEntityNotSelected(3, "Products");
        assertDataPickerEntityNotSelected(3, "Reviews");
      });
    });
  });

  describe("table as a source", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
    });

    it("should correctly display the source data for ad-hoc questions", () => {
      H.openReviewsTable();
      H.openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Reviews").click();
      H.miniPickerHeader().should("contain", "Sample Database");
      H.miniPicker().findByText("Reviews");

      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      assertDataPickerEntitySelected(2, "Reviews");
    });

    it("should correctly display the source data for a simple saved question", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      H.miniPickerHeader().should("contain", "Sample Database");
      H.miniPicker().findByText("Orders");

      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      assertDataPickerEntitySelected(2, "Orders");
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

        H.restore(`${dialect}-writable`);
        H.resetTestTable({ type: dialect, table: testTable1 });
        H.resetTestTable({ type: dialect, table: testTable2 });

        cy.signInAsAdmin();

        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
        });

        H.startNewQuestion();
        H.miniPicker().within(() => {
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });
        H.visualize();
        H.saveQuestionToCollection("Beasts");

        H.openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        H.miniPickerHeader().should("contain", schemaName);
        H.miniPicker().findByText(tableName).should("exist");

        cy.realType("a"); // start typing to expose mini-picker "Browse all" option
        H.miniPickerBrowseAll().click();
        H.entityPickerModal().within(() => {
          assertDataPickerEntitySelected(1, dbName);
          assertDataPickerEntitySelected(2, schemaName);
          assertDataPickerEntitySelected(3, tableName);
          cy.findByText(tableName).click();
        });

        cy.log("select a table from the second schema");
        H.join();
        H.miniPicker().within(() => {
          cy.findByText(dbName).click();
          cy.findByText("public").click();
          cy.findByText("Many Data Types").click();
        });
        H.popover().findByText("Name").click();
        H.popover().findByText("Text").click();

        cy.log("select a table from the third schema");
        H.join();
        H.miniPicker().within(() => {
          cy.findByText(dbName).click();
          cy.findByText("Domestic").click();
          cy.findByText("Animals").click();
        });
        H.popover().findByText("Name").click();
        H.popover().findByText("Name").click();
      },
    );

    it("should correctly display a table as the model's source when editing simple model's query", () => {
      cy.visit(`/model/${ORDERS_MODEL_ID}/query`);

      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      H.miniPicker().within(() => {
        H.miniPickerHeader().should("contain", "Sample Database");
        cy.findByText("Orders").should("exist");
      });
    });
  });

  describe("library table as a source", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.createLibrary();
    });

    it("should allow to pick a published table from the mini picker", () => {
      H.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      H.startNewQuestion();

      cy.log("verify the picker when nothing is selected");
      H.popover().findByText("Orders").click();
      H.join();
      H.popover().findByText("Products").click();
      H.visualize();
      H.tableHeaderColumn("User ID").should("be.visible");
      H.tableHeaderColumn("Products → ID").should("be.visible");

      cy.log("verify the picker when there is a selected item");
      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders").click();
      H.popover().findByText("Products").click();
      H.getNotebookStep("data").findByText("Products").should("be.visible");
    });

    it("should allow to pick a publish table from the data picker", () => {
      H.publishTables({ table_ids: [ORDERS_ID, PRODUCTS_ID] });
      H.startNewQuestion();

      cy.log("verify the picker when nothing is selected");
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalLevel(0).findByText("Library").click();
        H.entityPickerModalLevel(1).findByText("Data").click();
        cy.findByText("Orders").click();
      });

      H.join();
      H.popover().findByText("Browse all").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalLevel(0).findByText("Library").click();
        H.entityPickerModalLevel(1).findByText("Data").click();
        cy.findByText("Products").click();
      });

      H.visualize();
      H.tableHeaderColumn("User ID").should("be.visible");
      H.tableHeaderColumn("Products → ID").should("be.visible");

      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders").click();
      H.popover().within(() => {
        cy.findByText("Data").click();
        cy.findByText("Browse all").click();
      });

      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Library").should(
          "have.attr",
          "data-active",
          "true",
        );
        H.entityPickerModalItem(1, "Data").should(
          "have.attr",
          "data-active",
          "true",
        );
        H.entityPickerModalItem(2, "Orders").should(
          "have.attr",
          "data-active",
          "true",
        );
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
      H.restore();
      cy.signInAsAdmin();
    });

    it("data selector should properly show a model as the source (metabase#39699)", () => {
      H.createQuestion(modelDetails, { visitQuestion: true });
      H.openNotebook();
      cy.findByTestId("data-step-cell")
        .should("have.text", modelDetails.name)
        .click();

      H.miniPicker().within(() => {
        cy.findByText(checkNotNull(modelDetails.name))
          .should("exist")
          .and("contain.text", checkNotNull(modelDetails.name));
      });
    });

    it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
      H.visitModel(ORDERS_MODEL_ID);
      H.openNotebook();

      openDataSelector();
      H.miniPickerHeader().should("contain", "Our analytics");
      H.miniPicker().findByText("Orders Model").should("exist");

      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "Orders Model");

        cy.button("Close").click();
      });

      moveToCollection("First collection");

      openDataSelector();

      H.miniPickerHeader().should("contain", "First collection");
      H.miniPicker().findByText("Orders Model").should("exist");

      H.miniPickerHeader().click();
      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Orders Model");
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

      H.createQuestion(nestedQuestionDetails, {
        wrapId: true,
        idAlias: "nestedQuestionId",
      });

      cy.log("see nested question in our analytics");

      H.visitQuestion("@nestedQuestionId");
      H.openNotebook();
      openDataSelector();
      H.miniPickerHeader().should("contain", "Our analytics");
      H.miniPicker().findByText(sourceQuestionName).should("exist");

      H.miniPickerHeader().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, sourceQuestionName);

        cy.button("Close").click();
      });

      cy.log("Move the source question to another collection");
      H.visitQuestion(SOURCE_QUESTION_ID);
      H.openNotebook();
      moveToCollection("First collection");

      cy.log("Make sure the source change is reflected in a nested question");
      H.visitQuestion("@nestedQuestionId");
      H.openNotebook();

      openDataSelector();
      H.miniPickerHeader().should("contain", "First collection");
      H.miniPicker().findByText(sourceQuestionName).should("exist");

      H.miniPickerHeader().click().click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, sourceQuestionName);
      });
    });
  });
});

describe("issue 34350", { tags: "@external" }, () => {
  beforeEach(() => {
    H.restore("postgres-12");
    cy.signInAsAdmin();
  });

  it("works after changing question's source table to a one from a different database (metabase#34350)", () => {
    H.openOrdersTable({ mode: "notebook" });
    openDataSelector();
    H.miniPicker().within(() => {
      H.miniPickerHeader().click();
      cy.findByText("QA Postgres12").click();
      cy.findByText("Orders").click();
    });

    H.visualize();

    H.queryBuilderMain()
      .findByText("There was a problem with your question")
      .should("not.exist");
    cy.findAllByTestId("cell-data").should("contain", "37.65");
  });
});

describe("issue 28106", () => {
  beforeEach(() => {
    const dialect = "postgres";

    H.restore(`${dialect}-writable`);
    H.resetTestTable({ type: dialect, table: "many_schemas" });
    cy.signInAsAdmin();

    H.resyncDatabase({ dbId: WRITABLE_DB_ID });

    cy.intercept("GET", "/api/collection/root").as("getRootCollection");
    cy.intercept("GET", "/api/collection/tree**").as("getTree");
  });

  it(
    "should not jump to the top of schema list when scrolling (metabase#28106)",
    { tags: "@external" },
    () => {
      H.startNewQuestion();
      cy.wait(["@getRootCollection", "@getTree"]);

      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Databases").click();
        cy.findByText("Writable Postgres12").click();
        cy.findByText("Schema A").click();

        H.entityPickerModalLevel(2)
          .findByTestId("scroll-container")
          .as("schemasList");

        H.entityPickerModalLevel(3).should("contain", "Animals");

        cy.get("@schemasList").scrollTo("bottom");

        // assert scrolling worked and the last item is visible
        H.entityPickerModalItem(2, "Schema Z").should("be.visible");

        // simulate scrolling up using mouse wheel 3 times
        for (let i = 0; i < 3; ++i) {
          cy.get("@schemasList").realMouseWheel({ deltaY: -50 });
          cy.wait(100);
        }

        // assert first item does not exist - this means the list has not been scrolled to the top
        cy.findByText("Schema A").should("not.exist");
        cy.get("@schemasList").should(([$element]) => {
          expect($element.scrollTop).to.be.greaterThan(0);
        });
      });
    },
  );
});

describe("issue 32252", () => {
  beforeEach(() => {
    H.restore("setup");
    cy.signInAsAdmin();

    H.createCollection({ name: "My collection" }).then(
      ({ body: collection }) => {
        if (typeof collection.id !== "number") {
          throw new Error("collection.id is not a number");
        }

        H.createQuestion({
          name: "My question",
          collection_id: collection.id,
          query: {
            "source-table": ORDERS_ID,
          },
        });
      },
    );
  });

  it("refreshes data picker sources after archiving a collection (metabase#32252)", () => {
    cy.visit("/");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("My collection").click();
      cy.findByText("My question").should("exist");
    });

    cy.findByTestId("sidebar-toggle").click();
    H.navigationSidebar().findByText("Our analytics").click();

    cy.findAllByRole("button", { name: "Actions" }).eq(0).click();
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed collection")
      .should("be.visible");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("My collection").should("not.exist");
      cy.findByText("My question").should("not.exist");
    });
  });

  it("refreshes data picker sources after archiving a question (metabase#32252)", () => {
    cy.visit("/");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("My collection").click();
      cy.findByText("My question").should("exist");
    });

    cy.findByTestId("sidebar-toggle").click();
    H.navigationSidebar().findByText("Our analytics").click();

    cy.findAllByTestId("collection-entry-name")
      .findByText("My collection")
      .click();
    cy.button("Actions").click();
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed question")
      .should("be.visible");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText("My collection").should("not.exist");
      cy.findByText("My question").should("not.exist");
    });
  });
});

function moveToCollection(collection: string) {
  cy.intercept("GET", "/api/collection/tree**").as("updateCollectionTree");

  H.openQuestionActions();
  H.popover().findByTextEnsureVisible("Move").click();

  H.entityPickerModal().within(() => {
    cy.findByText(collection).click();
    cy.button("Move").click();
    cy.wait("@updateCollectionTree");
  });
}

function openDataSelector() {
  cy.findByTestId("data-step-cell").click();
}

function assertDataPickerEntitySelected(level: number, name: string) {
  H.entityPickerModalItem(level, name).should(
    "have.attr",
    "data-active",
    "true",
  );
}

function assertDataPickerEntityNotSelected(level: number, name: string) {
  H.entityPickerModalItem(level, name).should("not.have.attr", "data-active");
}

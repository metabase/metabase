import { H } from "e2e/support";
import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
  SECOND_COLLECTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import { checkNotNull } from "metabase/lib/types";

const { ORDERS_ID, REVIEWS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("empty app db", () => {
    beforeEach(() => {
      H.restore("setup");
      cy.signInAsAdmin();
    });

    it(
      "should display tables from the only existing database by default",
      { tags: "@OSS" },
      () => {
        H.onlyOnOSS();
        cy.visit("/");
        cy.findByTestId("app-bar").findByText("New").click();
        H.popover().findByTextEnsureVisible("Question").click();
        cy.findByTestId("data-step-cell").should(
          "have.text",
          "Pick your starting data",
        );

        H.entityPickerModal().within(() => {
          cy.log("Should not have Recents tab");
          cy.findAllByRole("tab").should("have.length", 0);

          H.entityPickerModalLevel(0).should("not.exist");
          H.entityPickerModalLevel(1).should("not.exist");
          H.entityPickerModalLevel(2)
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
      H.createQuestion({
        name: "GUI Model",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
        type: "model",
      });

      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        cy.findAllByRole("tab").should("have.length", 2);
        H.entityPickerModalTab("Models").should("exist");
        H.entityPickerModalTab("Tables").should("exist");
        H.entityPickerModalTab("Saved questions").should("not.exist");
      });
    });

    it("should not show models if only saved questions exist", () => {
      H.createQuestion({
        name: "GUI Question",
        query: { "source-table": REVIEWS_ID, limit: 1 },
        display: "table",
      });

      H.startNewQuestion();

      H.entityPickerModal().within(() => {
        H.shouldDisplayTabs(["Tables", "Saved questions"]);
        H.entityPickerModalTab("Models").should("not.exist");
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
      H.entityPickerModal().within(() => {
        H.tabsShouldBe("Tables", ["Models", "Tables", "Saved questions"]);
        // should not show databases step if there's only 1 database
        H.entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        H.entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Reviews");
      });
    });

    it("should correctly display the source data for a simple saved question", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openNotebook();
      cy.findByTestId("data-step-cell").should("have.text", "Orders").click();
      H.entityPickerModal().within(() => {
        H.tabsShouldBe("Tables", ["Models", "Tables", "Saved questions"]);
        // should not show databases step if there's only 1 database
        H.entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        H.entityPickerModalLevel(1).should("not.exist");
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

        H.resetTestTable({ type: dialect, table: testTable1 });
        H.resetTestTable({ type: dialect, table: testTable2 });
        H.restore(`${dialect}-writable`);

        cy.signInAsAdmin();

        H.resyncDatabase({
          dbId: WRITABLE_DB_ID,
        });

        H.startNewQuestion();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });
        H.visualize();
        H.saveQuestion("Beasts");

        H.openNotebook();
        cy.findByTestId("data-step-cell").should("contain", tableName).click();
        H.entityPickerModal().within(() => {
          assertDataPickerEntitySelected(0, dbName);
          assertDataPickerEntitySelected(1, schemaName);
          assertDataPickerEntitySelected(2, tableName);

          H.entityPickerModalTab("Recents").click();
          cy.contains("button", "Animals")
            .should("exist")
            .and("contain.text", tableName)
            .and("have.attr", "aria-selected", "true");

          H.entityPickerModalTab("Tables").click();
          cy.findByText(dbName).click();
          cy.findByText(schemaName).click();
          cy.findByText(tableName).click();
        });

        cy.log("select a table from the second schema");
        H.join();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText("Public").click();
          cy.findByText("Many Data Types").click();
        });
        H.popover().findByText("Name").click();
        H.popover().findByText("Text").click();

        cy.log("select a table from the third schema");
        H.join();
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
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
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        // should not show databases step if there's only 1 database
        H.entityPickerModalLevel(0).should("not.exist");
        // should not show schema step if there's only 1 schema
        H.entityPickerModalLevel(1).should("not.exist");
        assertDataPickerEntitySelected(2, "Orders");
      });
    });
  });

  describe("saved entity as a source (aka the virtual table)", () => {
    const modelDetails: H.StructuredQuestionDetails = {
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

      H.entityPickerModal().within(() => {
        H.shouldDisplayTabs(["Models", "Tables", "Saved questions"]);

        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, "Second collection");
        assertDataPickerEntitySelected(3, checkNotNull(modelDetails.name));

        cy.findByText(checkNotNull(modelDetails.name))
          .should("exist")
          .and("contain.text", checkNotNull(modelDetails.name));
      });
    });

    it("moving the model to another collection should immediately be reflected in the data selector (metabase#39812-1)", () => {
      H.visitModel(ORDERS_MODEL_ID);
      H.openNotebook();

      openDataSelector();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "Orders Model");

        cy.button("Close").click();
      });

      moveToCollection("First collection");

      openDataSelector();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Models").should(
          "have.attr",
          "aria-selected",
          "true",
        );
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
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
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
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Saved questions").should(
          "have.attr",
          "aria-selected",
          "true",
        );
        assertDataPickerEntitySelected(0, "Our analytics");
        assertDataPickerEntitySelected(1, "First collection");
        assertDataPickerEntitySelected(2, sourceQuestionName);
      });
    });
  });
});

describe("scenarios > notebook > data source", { tags: "@OSS" }, () => {
  beforeEach(() => {
    H.onlyOnOSS();
    H.restore("setup");
    cy.signInAsAdmin();
  });

  it("should not show saved questions if only models exist (metabase#25142)", () => {
    H.createQuestion({
      name: "GUI Model",
      query: { "source-table": REVIEWS_ID, limit: 1 },
      display: "table",
      type: "model",
    });
    H.startNewQuestion();
    H.entityPickerModal().within(() => {
      cy.findAllByRole("tab").should("have.length", 2);
      H.entityPickerModalTab("Tables").should("be.visible");
      H.entityPickerModalTab("Models").should("be.visible");
      H.entityPickerModalTab("Saved questions").should("not.exist");
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
    H.entityPickerModal().within(() => {
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

    H.resetTestTable({ type: dialect, table: "many_schemas" });
    H.restore(`${dialect}-writable`);
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

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Writable Postgres12").click();

        H.entityPickerModalLevel(1)
          .findByTestId("scroll-container")
          .as("schemasList");

        scrollAllTheWayDown();

        // assert scrolling worked and the last item is visible
        H.entityPickerModalItem(1, "Public").should("be.visible");

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

  // The list is virtualized and the scrollbar height changes during scrolling (metabase#44966)
  // that's why we need to scroll and wait multiple times.
  function scrollAllTheWayDown() {
    cy.get("@schemasList").realMouseWheel({ deltaY: 100 });
    cy.wait(100);

    cy.get("@schemasList").then($element => {
      const list = $element[0];
      const isScrolledAllTheWayDown =
        list.scrollHeight - list.scrollTop === list.clientHeight;

      if (!isScrolledAllTheWayDown) {
        scrollAllTheWayDown();
      }
    });
  }
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
    H.entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    H.navigationSidebar().findByText("Our analytics").click();

    cy.button("Actions").click();
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed collection")
      .should("be.visible");

    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      cy.findByText("Orders").should("be.visible");
    });
  });

  it("refreshes data picker sources after archiving a question (metabase#32252)", () => {
    cy.visit("/");

    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("be.visible");
      cy.button("Close").click();
    });

    cy.findByTestId("sidebar-toggle").click();
    H.navigationSidebar().findByText("Our analytics").click();

    cy.findByTestId("collection-entry-name").click();
    cy.button("Actions").click();
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed question")
      .should("be.visible");

    H.newButton("Question").click();
    H.entityPickerModal().within(() => {
      cy.findByTestId("loading-indicator").should("not.exist");
      cy.findByText("Recents").should("not.exist");
      cy.findByText("Saved questions").should("not.exist");
      cy.findByText("Orders").should("be.visible");
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

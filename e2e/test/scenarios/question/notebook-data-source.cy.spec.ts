const { H } = cy;
import { SAMPLE_DB_ID, USERS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ALL_USERS_GROUP_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import { METAKEY } from "metabase/utils/browser";
import { DataPermissionValue } from "metabase-types/api/permissions";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > notebook > data source", () => {
  describe("saved entity as a source (aka the virtual table)", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();
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

describe("scenarios > notebook > link to data source", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.on("window:before:load", (win) => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").callsFake((url) => {
        expect(win.open).to.be.calledOnce;
        // replace the current page with the linked data source upon ctrl/meta click
        win.location.assign(url);
      });
    });
  });

  it("smoke test", () => {
    H.openReviewsTable({ mode: "notebook" });

    cy.log("Normal click on the data source still opens the entity picker");
    H.getNotebookStep("data").findByText("Reviews").click();
    H.miniPicker().should("exist");
    H.miniPicker().findByText("Reviews").click(); // close miniPicker

    cy.log("Meta/Ctrl click on the fields picker behaves as a regular click");
    H.getNotebookStep("data")
      .findByTestId("fields-picker")
      .click(H.holdMetaKey);
    H.popover().within(() => {
      cy.findByText("Select all").click();
    });
    // Regular click on the fields picker again to close the popover
    H.getNotebookStep("data").findByTestId("fields-picker").click();
    // Mid-test sanity-check assertion
    H.visualize();
    cy.findAllByTestId("header-cell")
      .should("have.length", 1)
      .and("have.text", "ID");

    cy.log(
      "Deselecting columns should have no effect on the linked data source in new tab/window",
    );
    H.openNotebook();

    cy.log("Make sure tooltip is being shown on hover");
    H.getNotebookStep("data")
      .findByText("Reviews")
      .should("be.visible")
      .realHover();
    cy.findByRole("tooltip").should(
      "have.text",
      `${METAKEY}+click to open in new tab`,
    );

    H.getNotebookStep("data").findByText("Reviews").click(H.holdMetaKey);
    cy.wait("@dataset"); // already intercepted in `visualize()`

    cy.log("Make sure Reviews table is rendered in a simple mode");
    cy.findAllByTestId("header-cell").should("contain", "Reviewer");
    H.tableInteractive().should("contain", "xavier");
    cy.findByTestId("question-row-count").should(
      "have.text",
      "Showing 1,112 rows",
    );

    cy.findByTestId("qb-save-button").should("be.enabled");
  });

  context("permissions", () => {
    it("shouldn't show the source question to users without write query permissions or if it lives in a collection that user can't see", () => {
      H.createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.log(
          "A user with curate collection permissions but without write query permissions should not see the notebook icon",
        );
        cy.signIn("nodata");
        H.visitQuestion(nestedQuestion.id);
        cy.findByTestId("qb-header-action-panel").should("be.visible");
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.signInAsAdmin();

        cy.log("Move the source question to admin's personal collection");
        cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
          collection_id: ADMIN_PERSONAL_COLLECTION_ID,
        });

        cy.signInAsNormalUser();
        H.visitQuestion(nestedQuestion.id);

        cy.log("We should not even show the notebook icon");
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.log(
          "Even if user opens the notebook link directly, they should not see the source question. We open the entity picker instead",
        );
        cy.visit(`/question/${nestedQuestion.id}/notebook`);

        H.getNotebookStep("data")
          .findByPlaceholderText("Search for tables and more...")
          .should("exist");
        H.miniPicker().should("be.visible");

        cy.log(
          "The same should be true for a user that additionally doesn't have write query permissions",
        );
        cy.signIn("nodata");
        H.visitQuestion(nestedQuestion.id);
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.visit(`/question/${nestedQuestion.id}/notebook`);
        cy.url().should("include", "/unauthorized");
        H.main()
          .findByText("Sorry, you don’t have permission to see that.")
          .should("be.visible");
      });
    });

    describe("sandboxing", () => {
      beforeEach(() => {
        H.activateToken("pro-self-hosted");

        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP_ID]: {
            [SAMPLE_DB_ID]: {
              "view-data": DataPermissionValue.BLOCKED,
            },
          },
        });

        cy.sandboxTable({
          table_id: ORDERS_ID,
          attribute_remappings: {
            attr_uid: [
              "dimension",
              ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }],
            ],
          },
        });

        cy.signInAsSandboxedUser();
      });

      it("should work for sandboxed users when opening a table/question/model", () => {
        H.visitModel(ORDERS_MODEL_ID);
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 11 rows",
        );
        H.openNotebook();
        H.getNotebookStep("data")
          .findByText("Orders Model")
          .click(H.holdMetaKey);
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 11 rows",
        );
        H.assertDatasetReqIsSandboxed({
          requestAlias: `@modelQuery${ORDERS_MODEL_ID}`,
        });
      });

      it("should work for sandboxed users when joined table is sandboxed", () => {
        cy.intercept("/api/dataset").as("dataset");

        H.openProductsTable({ mode: "notebook" });
        cy.findByTestId("action-buttons").button("Join data").click();
        H.miniPicker().within(() => {
          cy.findByText("Sample Database").click();
          cy.findByText("Orders").click();
        });

        H.getNotebookStep("join")
          .findByLabelText("Right table")
          .should("have.text", "Orders")
          .click(H.holdMetaKey);

        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 11 rows",
        );
        H.assertDatasetReqIsSandboxed({
          columnId: ORDERS.USER_ID,
          columnAssertion: Number(USERS.sandboxed.login_attributes.attr_uid),
        });
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

    cy.findAllByTestId("cell-data").should("contain", "37.65");
    H.queryBuilderMain()
      .findByText("There was a problem with your question")
      .should("not.exist");
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

    // The items table renders with zero rows while the items query is in flight, so
    // the row's Actions button mounts late. Anchor on the row before opening its menu,
    // otherwise the click lands on a freshly mounted Mantine Menu target and is dropped.
    H.getUnpinnedSection().findByText("My collection").should("be.visible");
    H.openUnpinnedItemMenu("My collection");
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed collection")
      .should("be.visible");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      H.miniPickerHeader().should("contain", "Our analytics");
      cy.findByTestId("mini-picker-list-loader").should("not.exist");
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
    H.getUnpinnedSection().findByText("My question").should("be.visible");
    H.openUnpinnedItemMenu("My question");
    H.popover().findByText("Move to trash").click();
    cy.findByTestId("toast-undo")
      .findByText("Trashed question")
      .should("be.visible");

    H.newButton("Question").click();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      H.miniPickerHeader().should("contain", "Our analytics");
      cy.findByTestId("mini-picker-list-loader").should("not.exist");
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

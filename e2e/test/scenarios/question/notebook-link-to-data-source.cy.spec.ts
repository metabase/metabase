import { H } from "e2e/support";
import { SAMPLE_DB_ID, USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ADMIN_PERSONAL_COLLECTION_ID,
  ALL_USERS_GROUP_ID,
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import { METAKEY } from "metabase/lib/browser";

const {
  ORDERS,
  ORDERS_ID,
  PRODUCTS_ID,
  REVIEWS,
  REVIEWS_ID,
  PEOPLE_ID,
  PRODUCTS,
} = SAMPLE_DATABASE;

// https://docs.cypress.io/api/cypress-api/platform
const macOSX = Cypress.platform === "darwin";

const clickConfig = {
  metaKey: macOSX,
  ctrlKey: !macOSX,
};

describe("scenarios > notebook > link to data source", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.on("window:before:load", win => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").callsFake(url => {
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
    cy.findByTestId("entity-picker-modal").within(() => {
      cy.findByText("Pick your starting data").should("be.visible");
      cy.findByLabelText("Close").click();
    });

    cy.log("Meta/Ctrl click on the fields picker behaves as a regular click");
    H.getNotebookStep("data").findByTestId("fields-picker").click(clickConfig);
    H.popover().within(() => {
      cy.findByText("Select none").click();
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

    H.getNotebookStep("data").findByText("Reviews").click(clickConfig);
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

  context("questions", () => {
    it("should open the source table from a simple question", () => {
      H.visitQuestion(ORDERS_COUNT_QUESTION_ID);
      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders").click(clickConfig);

      cy.log("Make sure Orders table is rendered in a simple mode");
      cy.findAllByTestId("header-cell").should("contain", "Subtotal");
      H.tableInteractive().should("contain", "37.65");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing first 2,000 rows",
      );

      cy.findByTestId("qb-save-button").should("be.enabled");
    });

    it("should open the source question from a nested question", () => {
      H.createQuestion(
        {
          name: "Nested question based on a question",
          query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
        },
        { visitQuestion: true },
      );

      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders, Count").click(clickConfig);

      cy.log("Make sure the source question rendered in a simple mode");
      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      cy.findAllByTestId("header-cell")
        .should("have.length", "1")
        .and("have.text", "Count");
      H.tableInteractive().should("contain", "18,760");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing 1 row",
      );

      // Question is not dirty
      cy.findByTestId("qb-save-button").should("not.exist");
    });

    it("should open the source question from a nested question where the source is native question", () => {
      const source = {
        name: "Native source",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
      };

      H.createNativeQuestion(source).then(({ body: sourceQuestion }) => {
        H.createQuestion(
          {
            name: "Nested question based on a native question",
            query: { "source-table": `card__${sourceQuestion.id}` },
          },
          { visitQuestion: true },
        );

        H.openNotebook();
        H.getNotebookStep("data").findByText(source.name).click(clickConfig);

        cy.log("Make sure the source question rendered in a simple mode");
        cy.location("pathname").should(
          "eq",
          `/question/${sourceQuestion.id}-native-source`,
        );

        cy.findAllByTestId("header-cell")
          .should("have.length", "1")
          .and("have.text", "FOO");
        cy.get("#main-data-grid")
          .findByTestId("cell-data")
          .should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Question is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it("should open the source model from a nested question", () => {
      H.createQuestion(
        {
          name: "Nested question based on a model",
          query: { "source-table": `card__${ORDERS_MODEL_ID}` },
        },
        { visitQuestion: true },
      );

      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders Model").click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.location("pathname").should(
        "eq",
        `/model/${ORDERS_MODEL_ID}-orders-model`,
      );
      cy.findAllByTestId("header-cell").should("contain", "Subtotal");
      H.tableInteractive().should("contain", "37.65");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      cy.findByTestId("qb-save-button").should("not.exist");
    });

    it("should open the source model from a nested question where the source is native model", () => {
      const source: H.NativeQuestionDetails = {
        name: "Native source",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
        type: "model",
      };

      H.createNativeQuestion(source).then(({ body: sourceQuestion }) => {
        H.createQuestion(
          {
            name: "Nested question based on a native question",
            query: { "source-table": `card__${sourceQuestion.id}` },
          },
          { visitQuestion: true },
        );

        H.openNotebook();
        H.getNotebookStep("data")
          .findByText(sourceQuestion.name)
          .click(clickConfig);

        cy.log("Make sure the source model rendered in a simple mode");
        cy.location("pathname").should(
          "eq",
          `/model/${sourceQuestion.id}-native-source`,
        );

        cy.findByTestId("scalar-value").should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it('should open the "trash" if the source question has been archived', () => {
      H.createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.log("Move the source question to the trash");
        cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
          archived: true,
        });

        H.visitQuestion(nestedQuestion.id);
      });

      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders, Count").click(clickConfig);

      cy.log('Make sure the source question opens in the "trash"');
      cy.location("pathname").should(
        "eq",
        `/question/${ORDERS_COUNT_QUESTION_ID}-orders-count`,
      );
      cy.findByTestId("archive-banner").should(
        "contain",
        "This question is in the trash",
      );
    });
  });

  context("models", () => {
    it("should open the underlying model", () => {
      H.visitModel(ORDERS_MODEL_ID);
      H.openNotebook();
      H.getNotebookStep("data").findByText("Orders Model").click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.location("pathname").should(
        "eq",
        `/model/${ORDERS_MODEL_ID}-orders-model`,
      );
      cy.findAllByTestId("header-cell").should("contain", "Subtotal");
      H.tableInteractive().should("contain", "37.65");
      cy.findByTestId("question-row-count").should(
        "have.text",
        "Showing first 2,000 rows",
      );

      // Model is not dirty
      cy.findByTestId("qb-save-button").should("not.exist");
    });

    it("should open the underlying native model", () => {
      const model: H.NativeQuestionDetails = {
        name: "Native model",
        native: {
          query: "select 1 as foo",
          "template-tags": {},
        },
        type: "model",
      };

      H.createNativeQuestion(model).then(({ body: { id, name } }) => {
        H.visitModel(id);

        H.openNotebook();
        H.getNotebookStep("data").findByText(name).click(clickConfig);

        cy.log("Make sure the source model rendered in a simple mode");
        cy.location("pathname").should("eq", `/model/${id}-native-model`);

        cy.findByTestId("scalar-value").should("have.text", "1");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it("should open the nested model (based on a question) as the data source", () => {
      H.createQuestion(
        {
          name: "Nested model based on a question",
          query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
          type: "model",
        },
        { visitQuestion: true, wrapId: true, idAlias: "nestedModelId" },
      );

      H.openNotebook();
      H.getNotebookStep("data")
        .findByText("Nested model based on a question")
        .click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.get("@nestedModelId").then(id => {
        cy.location("pathname").should(
          "eq",
          `/model/${id}-nested-model-based-on-a-question`,
        );
        cy.findByTestId("scalar-value").should("have.text", "18,760");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 1 row",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });

    it("should open the nested model (based on a model) as the data source", () => {
      H.createQuestion(
        {
          name: "Nested model based on a model",
          query: { "source-table": `card__${ORDERS_MODEL_ID}` },
          type: "model",
        },
        { visitQuestion: true, wrapId: true, idAlias: "nestedModelId" },
      );

      H.openNotebook();
      H.getNotebookStep("data")
        .findByText("Nested model based on a model")
        .click(clickConfig);

      cy.log("Make sure the source model is rendered in a simple mode");
      cy.get("@nestedModelId").then(id => {
        cy.location("pathname").should(
          "eq",
          `/model/${id}-nested-model-based-on-a-model`,
        );
        cy.findAllByTestId("header-cell").should("contain", "Subtotal");
        H.tableInteractive().should("contain", "37.65");
        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing first 2,000 rows",
        );

        // Model is not dirty
        cy.findByTestId("qb-save-button").should("not.exist");
      });
    });
  });

  context("permissions", () => {
    it("shouldn't show the source question if it lives in a collection that user can't see", () => {
      H.createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
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
        cy.findByTestId("entity-picker-modal").within(() => {
          cy.findByText("Pick your starting data").should("be.visible");
          cy.findByLabelText("Close").click();
        });

        H.getNotebookStep("data").should("contain", "Pick your starting data");

        cy.log(
          "The same should be true for a user that additionally doesn't have write query permissions",
        );
        cy.signIn("nodata");
        H.visitQuestion(nestedQuestion.id);
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        cy.visit(`/question/${nestedQuestion.id}/notebook`);
        cy.findByTestId("entity-picker-modal").within(() => {
          cy.findByText("Pick your starting data").should("be.visible");
          cy.findByLabelText("Close").click();
        });

        H.getNotebookStep("data").should("contain", "Pick your starting data");
      });
    });

    it("user with the curate collection permissions but without write query permissions shouldn't be able to see/open the source question", () => {
      H.createQuestion({
        name: "Nested question based on a question",
        query: { "source-table": `card__${ORDERS_COUNT_QUESTION_ID}` },
      }).then(({ body: nestedQuestion }) => {
        cy.signIn("nodata");
        H.visitQuestion(nestedQuestion.id);

        cy.log("We should not even show the notebook icon");
        cy.findByTestId("qb-header-action-panel")
          .icon("notebook")
          .should("not.exist");

        // TODO update the following once metabase##46398 is fixed
        // cy.visit(`/question/${nestedQuestion.id}/notebook`);
      });
    });

    H.describeEE("sandboxing", () => {
      beforeEach(() => {
        H.setTokenFeatures("all");

        cy.updatePermissionsGraph({
          [ALL_USERS_GROUP_ID]: {
            [SAMPLE_DB_ID]: {
              "view-data": DataPermissionValue.BLOCKED,
            },
          },
        });

        // @ts-expect-error - Non-trivial types in `sandboxTable` that should be addressed separately
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
        H.getNotebookStep("data").findByText("Orders Model").click(clickConfig);
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
        H.entityPickerModal().within(() => {
          H.entityPickerModalTab("Tables").click();
          cy.findByText("Orders").click();
        });

        H.getNotebookStep("join")
          .findByLabelText("Right table")
          .should("have.text", "Orders")
          .click(clickConfig);

        cy.findByTestId("question-row-count").should(
          "have.text",
          "Showing 11 rows",
        );
        H.assertDatasetReqIsSandboxed({
          columnId: ORDERS.USER_ID,
          columnAssertion: USERS.sandboxed.login_attributes.attr_uid,
        });
      });
    });
  });

  context("joins", () => {
    const getQuery = (id: number) => {
      return {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            joins: [
              {
                fields: "all",
                strategy: "left-join",
                alias: "Orders Model",
                condition: [
                  "=",
                  ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
                  [
                    "field",
                    "PRODUCT_ID",
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Orders Model",
                    },
                  ],
                ],
                "source-table": `card__${ORDERS_MODEL_ID}`,
              },
              {
                fields: "all",
                strategy: "right-join",
                alias: "People - User",
                condition: [
                  "=",
                  [
                    "field",
                    ORDERS.USER_ID,
                    {
                      "base-type": "type/Integer",
                      "join-alias": "Orders Model",
                    },
                  ],
                  [
                    "field",
                    "ID",
                    {
                      "base-type": "type/BigInteger",
                      "join-alias": "People - User",
                    },
                  ],
                ],
                "source-table": `card__${id}`,
              },
              {
                fields: "all",
                strategy: "inner-join",
                alias: "Reviews",
                condition: [
                  "=",
                  ["field", PRODUCTS.ID, { "base-type": "type/BigInteger" }],
                  [
                    "field",
                    REVIEWS.PRODUCT_ID,
                    { "base-type": "type/Integer", "join-alias": "Reviews" },
                  ],
                ],
                "source-table": REVIEWS_ID,
              },
            ],
          },
          parameters: [],
        },
      };
    };

    it("rhs joined data sources should open in a new tab on the meta/ctrl click", () => {
      H.createQuestion({
        name: "People - Saved Question",
        query: {
          "source-table": PEOPLE_ID,
        },
      }).then(({ body: savedQuestion }) => {
        const queryWithMultipleJoins = getQuery(savedQuestion.id);
        H.visitQuestionAdhoc(queryWithMultipleJoins, { mode: "notebook" });

        (function testModel() {
          cy.log("Model should open in a new tab");

          H.getNotebookStep("join", { stage: 0, index: 0 }).within(() => {
            cy.findByLabelText("Right table")
              .should("have.text", "Orders Model")
              .click(clickConfig);
          });

          cy.location("pathname").should(
            "eq",
            `/model/${ORDERS_MODEL_ID}-orders-model`,
          );
          cy.findAllByTestId("header-cell").should("contain", "Subtotal");
          H.tableInteractive().should("contain", "37.65");
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing first 2,000 rows",
          );

          // Model is not dirty
          cy.findByTestId("qb-save-button").should("not.exist");
          cy.go("back");
        })();

        (function testSavedQuestion() {
          cy.log("Saved question should open in a new tab");

          H.getNotebookStep("join", { stage: 0, index: 1 }).within(() => {
            cy.findByLabelText("Right table")
              .should("have.text", savedQuestion.name)
              .click(clickConfig);
          });

          cy.location("pathname").should(
            "eq",
            `/question/${savedQuestion.id}-people-saved-question`,
          );
          cy.findAllByTestId("header-cell").should("contain", "City");
          H.tableInteractive().should("contain", "Beaver Dams");
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing first 2,000 rows",
          );

          // Question is not dirty
          cy.findByTestId("qb-save-button").should("not.exist");
          cy.go("back");
        })();

        (function testRawTable() {
          cy.log("Raw table should open in a new tab");
          H.getNotebookStep("join", { stage: 0, index: 2 }).within(() => {
            cy.findByLabelText("Right table")
              .should("have.text", "Reviews")
              .click(clickConfig);
          });

          cy.findAllByTestId("header-cell").should("contain", "Reviewer");
          H.tableInteractive().should("contain", "xavier");
          cy.findByTestId("question-row-count").should(
            "have.text",
            "Showing 1,112 rows",
          );

          // Raw table is dirty by default
          cy.findByTestId("qb-save-button").should("be.enabled");
          cy.go("back");
        })();

        (function testNegativeCases() {
          cy.log(
            "Join type selector behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Change join type")
            .click(clickConfig);
          H.popover().should("contain", "Inner join");

          cy.log(
            "Pick columns selector behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Pick columns")
            .click(clickConfig);
          H.popover().should("contain", "Discount");

          cy.log(
            "Left column join condition selector behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Left column")
            .click(clickConfig);
          H.popover().should("contain", "Vendor");

          cy.log(
            "Operator selector behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Change operator")
            .click(clickConfig);
          H.popover().should("contain", ">=");

          cy.log(
            "Right column join condition selector behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Right column")
            .click(clickConfig);
          H.popover().should("contain", "Discount");

          cy.log(
            "New join condition button behaves the same regardless of the click keyboard modifiers",
          );
          H.getNotebookStep("join")
            .findByLabelText("Add condition")
            .click(clickConfig);
          cy.findByTestId("new-join-condition").should("be.visible");
        })();
      });
    });
  });
});

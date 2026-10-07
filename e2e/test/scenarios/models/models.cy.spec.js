const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_BY_YEAR_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

import {
  assertIsModel,
  assertIsQuestion,
  assertQuestionIsBasedOnModel,
  saveQuestionBasedOnModel,
  selectDimensionOptionFromSidebar,
  selectFromDropdown,
  turnIntoModel,
} from "./helpers/e2e-models-helpers";

const { PRODUCTS, ORDERS_ID, PRODUCTS_ID, ACCOUNTS_ID } = SAMPLE_DATABASE;

describe("scenarios > models", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows to turn a GUI question into a model", () => {
    H.createQuestion(
      {
        name: "Products Model",
        query: { "source-table": PRODUCTS_ID },
      },
      {
        wrapId: true,
        idAlias: "productsQuestionId",
      },
    );
    H.createQuestion(
      {
        name: "Accounts Model",
        query: { "source-table": ACCOUNTS_ID },
        type: "model",
      },
      {
        wrapId: true,
        idAlias: "accountsModelId",
      },
    );

    cy.get("@productsQuestionId").then((id) => {
      H.visitQuestion(id);

      turnIntoModel();
      H.openQuestionActions();
      assertIsModel();

      H.filter();
      H.popover().findByText("Vendor").click();
      H.selectFilterOperator("Contains");
      H.popover().within(() => {
        cy.findByLabelText("Filter value").type("Fisher");
        cy.button("Apply filter").click();
      });
      cy.wait("@dataset");

      assertQuestionIsBasedOnModel({
        model: "Products Model",
        collection: "Our analytics",
        table: "Products",
      });

      saveQuestionBasedOnModel({ name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Products Model",
        collection: "Our analytics",
        table: "Products",
      });
      cy.location("pathname").should("match", /^\/question\/\d+-q1$/);

      cy.findByTestId("qb-header")
        .findAllByText("Our analytics")
        .first()
        .click();
      getCollectionItemRow("Products Model").icon("model");
      getCollectionItemRow("Q1").icon("table2");
    });

    cy.log(
      "Question Lineage should show link to archived models (metabase#52071)",
    );
    cy.get("@accountsModelId").then((modelId) => {
      H.createQuestion(
        {
          name: "Accounts Model Quest",
          query: { "source-table": `card__${modelId}` },
        },
        {
          wrapId: true,
          idAlias: "accountsQuestionId",
        },
      );

      H.archiveQuestion(modelId);

      cy.get("@accountsQuestionId").then((questionId) => {
        H.visitQuestion(questionId);
        cy.findByTestId("qb-header-left-side").within(() => {
          cy.icon("warning").should("exist");

          cy.findByRole("link", { name: /accounts model/i }).should(
            "have.attr",
            "href",
            `/model/${modelId}-accounts-model`,
          );
        });
      });
    });
  });

  it("allows to turn a native question into a model", () => {
    H.createNativeQuestion(
      {
        name: "Product Model",
        native: {
          query: "SELECT * FROM products",
        },
      },
      { visitQuestion: true },
    );

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();

    H.filter();
    H.popover().findByText("VENDOR").click();
    H.selectFilterOperator("Contains");
    H.popover().within(() => {
      cy.findByLabelText("Filter value").type("Fisher");
      cy.button("Apply filter").click();
    });
    cy.wait("@dataset");

    assertQuestionIsBasedOnModel({
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    saveQuestionBasedOnModel({ name: "Q1" });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    getCollectionItemRow("Product Model").icon("model");
    getCollectionItemRow("Q1").icon("table2");

    cy.location("pathname").should("eq", "/collection/root");
  });

  it("allows to undo turning a question into a model, and shows the model info modal only once", () => {
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

    H.echartsContainer();
    H.tableInteractive().should("not.exist");

    turnIntoModel();

    cy.log("changes model's display to table");
    H.tableInteractive();
    H.echartsContainer().should("not.exist");

    H.undoToast().findByText("This is a model now.").should("exist");
    H.undo();
    cy.wait("@cardUpdate");

    H.echartsContainer();
    H.openQuestionActions();
    assertIsQuestion();

    cy.log("only shows model info modal once");
    H.popover().within(() => {
      cy.icon("model").click();
    });
    cy.wait("@cardUpdate");
    H.undoToast().findByText("This is a model now.").should("be.visible");
    H.tableInteractive().should("be.visible");
    H.modal().should("not.exist");
  });

  it("allows to open, turn back, and duplicate a model", () => {
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("cardUpdate");
    cy.intercept("POST", "/api/card").as("cardCreate");

    cy.log("shows 404 when opening a question with a /model URL");
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/We're a little lost/i);

    cy.log("redirects to /model URL when opening a model with /question URL");
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    // Important - do not use visitQuestion(ORDERS_QUESTION_ID) here!
    cy.visit("/question/" + ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    H.openQuestionActions();
    assertIsModel();
    cy.url().should("include", "/model");

    cy.log("turns a model back into a saved question");
    H.popover().within(() => {
      cy.findByText("Turn back to saved question").click();
    });

    cy.wait("@cardUpdate");

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This is a question now.");
    H.openQuestionActions();
    assertIsQuestion();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    H.openQuestionActions();
    assertIsModel();

    cy.log("duplicates a model");
    H.popover().within(() => {
      cy.findByText("Duplicate").click();
    });

    H.modal().within(() => {
      cy.findByLabelText("Name").should("have.value", "Orders - Duplicate");
      cy.findByLabelText(/Where do you want to save this/).click();
    });

    H.entityPickerModal().within(() => {
      cy.findByText(/Select a collection$/).should("exist"); // title should not have trailing "or dashboard"
      cy.findByText("First collection").should("exist");
      cy.findByText("Orders in a dashboard").should("not.exist"); // this dashboard would be present if dashboards were an allowed save target
      cy.findByText("First collection").click();
      cy.findByRole("button", { name: "Select this collection" }).click();
    });

    H.modal().within(() => {
      cy.findByText("Duplicate").click();
      cy.wait("@cardCreate");
    });

    H.modal().should("not.exist");
    cy.findByTestId("qb-header")
      .should("contain.text", "Orders - Duplicate")
      .and("contain.text", "First collection");
  });

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*").as("search");
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    });

    it("transforms the data picker", () => {
      H.createQuestion({
        name: "Products",
        query: { "source-table": PRODUCTS_ID },
      });
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();

      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("Orders Model").should("exist");
        cy.findByText("Orders, Count").should("exist");
        cy.findByText("Orders, Count, Grouped by Created At (year)").should(
          "exist",
        );
        cy.findByText("Products").should("exist");

        H.entityPickerModalItem(0, "Databases").click();
        H.entityPickerModalItem(1, "Sample Database").click();

        H.entityPickerModalItem(2, "Orders").should("exist");
        H.entityPickerModalItem(2, "People").should("exist");
        H.entityPickerModalItem(2, "Products").should("exist");
        H.entityPickerModalItem(2, "Reviews").should("exist");

        cy.findByText("Orders, Count").should("not.exist");

        cy.findByPlaceholderText("Search…").type("Ord");
        cy.wait("@search");

        getResults().should("have.length", 1);
        getResults()
          .eq(0)
          .should("have.attr", "data-model-type", "table")
          .and("contain.text", "Orders");

        cy.findByText("Everywhere").click();
        getResults().should("have.length", 5);
        getResults()
          .eq(0)
          .should("have.attr", "data-model-type", "dataset")
          .and("contain.text", "Orders Model");
        getResults()
          .eq(1)
          .should("have.attr", "data-model-type", "dataset")
          .and("contain.text", "Orders");
        getResults()
          .eq(2)
          .should("have.attr", "data-model-type", "card")
          .and("contain.text", "Orders, Count, Grouped by Created At (year)");
        getResults()
          .eq(3)
          .should("have.attr", "data-model-type", "card")
          .and("contain.text", "Orders, Count");
        getResults()
          .eq(4)
          .should("have.attr", "data-model-type", "table")
          .and("contain.text", "Orders");
      });
    });

    it("allows to create a question based on a model", () => {
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Our analytics").click();
        cy.findByText("Orders").click();
      });

      cy.icon("join_left_outer").click();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(0, "Databases").click();
        H.entityPickerModalItem(1, "Sample Database").click();

        H.entityPickerModalItem(2, "Orders").should("exist");
        H.entityPickerModalItem(2, "People").should("exist");
        H.entityPickerModalItem(2, "Products").should("exist");
        H.entityPickerModalItem(2, "Reviews").should("exist");

        H.entityPickerModalItem(2, "Products").click();
      });

      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().within(() => {
        cy.findByText("Products").click();
        cy.findByText("Price").click();
      });
      H.selectFilterOperator("Less than");
      H.popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("50");
        cy.button("Add filter").click();
      });

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      selectFromDropdown("Count of rows");

      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      H.visualize();
      H.echartsContainer();
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      cy.findByTestId("save-question-modal").within(() => {
        const recentDashboardName = "Orders in a dashboard";
        cy.findByLabelText("Where do you want to save this?").should(
          "have.text",
          recentDashboardName,
        );
        cy.findByText("Save").click();
      });

      cy.url().should("match", /\/dashboard\/\d+-[a-z0-9-]*$/);
    });

    it("should not display models if nested queries are disabled", () => {
      H.mockSessionProperty("enable-nested-queries", false);
      H.startNewQuestion();
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalItem(1, "Sample Database").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");

        cy.findByPlaceholderText("Search…").type("Ord");
        cy.wait("@search");
        cy.findByText("Everywhere").click();
        cy.get("[data-testid=result-item][data-model-type=table]").should(
          "contain.text",
          "Orders",
        );
        cy.get("[data-testid=result-item][data-model-type=dataset]").should(
          "not.exist",
        );
      });
    });
  });

  describe("simple mode", () => {
    beforeEach(() => {
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, {
        name: "Orders Model",
        type: "model",
      });
    });

    it("can create questions from a model and edit its info", () => {
      cy.log("create a question by filtering and summarizing a model");
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      H.filter();
      H.popover().findByText("Discount").click();
      H.selectFilterOperator("Not empty");
      H.popover().button("Apply filter").click();
      cy.wait("@dataset");

      assertQuestionIsBasedOnModel({
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      H.summarize();

      selectDimensionOptionFromSidebar("Created At");
      cy.wait("@dataset");
      cy.button("Done").click();

      assertQuestionIsBasedOnModel({
        questionName: "Count by Created At: Month",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnModel({ name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.location("pathname").should("match", /^\/question\/\d+-q1$/);

      cy.log("create a question using table click actions");
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      H.tableHeaderClick("Subtotal");
      selectFromDropdown("Sum over time");

      assertQuestionIsBasedOnModel({
        questionName: "Sum of Subtotal by Created At: Month",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnModel({ name: "Q2" });

      assertQuestionIsBasedOnModel({
        questionName: "Q2",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.location("pathname").should("match", /^\/question\/\d+-q2$/);

      cy.log("edit model info");
      cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("updateCard");
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      cy.findByTestId("saved-question-header-title").clear().type("M1").blur();
      cy.wait("@updateCard");

      H.questionInfoButton().click();

      cy.findByPlaceholderText("Add description").type("foo").blur();
      cy.wait("@updateCard");

      cy.findByDisplayValue("M1");
      // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
      cy.findByText("foo");
    });
  });

  it("shouldn't allow to turn native questions with variables into models", () => {
    H.createNativeQuestion(
      {
        native: {
          query: "SELECT * FROM products WHERE {{ID}}",
          "template-tags": {
            ID: {
              id: "6b8b10ef-0104-1047-1e1b-2492d5954322",
              name: "ID",
              display_name: "ID",
              type: "dimension",
              dimension: ["field", PRODUCTS.ID, null],
              "widget-type": "category",
              default: null,
            },
          },
        },
      },
      { visitQuestion: true },
    );

    H.openQuestionActions();
    H.popover().within(() => {
      cy.icon("model").click();
    });
    H.modal().within(() => {
      cy.findByText("Variables in models aren't supported yet");
      cy.button("Turn this into a model").should("not.exist");
      cy.icon("close").click();
    });
    H.openQuestionActions();
    assertIsQuestion();
    H.closeQuestionActions();

    // Check card tags are supported by models
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    H.NativeEditor.focus().type(
      "{leftarrow}{leftarrow}{backspace}{backspace}#1-orders",
    );
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click({ force: true });

    cy.findByTestId("save-question-modal").within((modal) => {
      cy.findByText("Save").click({ force: true });
    });

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();
  });

  it("shouldn't allow using variables in native models", () => {
    H.createNativeQuestion({
      native: { query: "SELECT * FROM products" },
    }).then(({ body: { id: modelId } }) => {
      cy.request("PUT", `/api/card/${modelId}`, { type: "model" }).then(() => {
        cy.visit(`/model/${modelId}/query`);
        H.NativeEditor.focus().type("{movetoend}").type(" WHERE {{F", {
          parseSpecialCharSequences: false,
        });
        // Blurring flushes the debounced query update that would open the sidebar
        H.NativeEditor.blur();
        H.NativeEditor.get().should("contain", "WHERE {{F");
        cy.findByTestId("dataset-edit-bar").should("be.visible");
        cy.findByTestId("tag-editor-sidebar").should("not.exist");
      });
    });
  });

  describe("dashboards", () => {
    const modelDetails = {
      name: "Orders Model 2",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
      type: "model",
    };

    beforeEach(() => {
      H.createQuestion(modelDetails);
    });

    it("should allow adding models to dashboards", () => {
      H.createDashboard().then(({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
        H.editDashboard();
        H.openQuestionsSidebar();
        H.sidebar().findByText(modelDetails.name).click();
        H.getDashboardCard().within(() => {
          cy.findByText(modelDetails.name);
          cy.findByText("37.65");
        });
        H.saveDashboard();
        H.getDashboardCard().within(() => {
          cy.findByText(modelDetails.name);
          cy.findByText("37.65");
        });
      });
    });
  });
});

function getCollectionItemRow(itemName) {
  return cy.findByText(itemName).closest("tr");
}

function getResults() {
  return cy.findAllByTestId("result-item");
}

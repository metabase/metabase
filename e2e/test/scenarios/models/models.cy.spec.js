import { H } from "e2e/support";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
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

const { PRODUCTS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > models", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");

    cy.createQuestion(
      {
        name: "Products",
        query: { "source-table": PRODUCTS_ID },
      },
      {
        wrapId: true,
        idAlias: "productsQuestionId",
      },
    );
  });

  it("allows to turn a GUI question into a model", () => {
    cy.get("@productsQuestionId").then(id => {
      cy.request("PUT", `/api/card/${id}`, {
        name: "Products Model",
      });
      H.visitQuestion(id);

      turnIntoModel();
      H.openQuestionActions();
      assertIsModel();

      H.filter();
      H.filterField("Vendor", {
        operator: "Contains",
        value: "Fisher",
      });

      cy.findByTestId("apply-filters").click();
      cy.wait("@dataset");

      assertQuestionIsBasedOnModel({
        model: "Products Model",
        collection: "Our analytics",
        table: "Products",
      });

      saveQuestionBasedOnModel({ modelId: id, name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Products Model",
        collection: "Our analytics",
        table: "Products",
      });

      cy.findByTestId("qb-header")
        .findAllByText("Our analytics")
        .first()
        .click();
      getCollectionItemCard("Products Model").icon("model");
      getCollectionItemRow("Q1").icon("table2");

      cy.url().should("not.include", "/question/" + id);
    });
  });

  it("allows to turn a native question into a model", () => {
    cy.createNativeQuestion(
      {
        name: "Product Model",
        native: {
          query: "SELECT * FROM products",
        },
      },
      { visitQuestion: true, wrapId: true },
    );

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();

    H.filter();
    H.filterField("VENDOR", {
      operator: "Contains",
      value: "Fisher",
    });

    cy.findByTestId("apply-filters").click();
    cy.wait("@dataset");

    assertQuestionIsBasedOnModel({
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    cy.get("@questionId").then(questionId => {
      saveQuestionBasedOnModel({ modelId: questionId, name: "Q1" });
    });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Product Model",
      collection: "Our analytics",
      table: "Products",
    });

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    getCollectionItemCard("Product Model").within(() => {
      cy.icon("model");
    });
    getCollectionItemRow("Q1").icon("table2");

    cy.location("pathname").should("eq", "/collection/root");
  });

  it("allows to turn a native question with a long alias into a model (metabase#47584)", () => {
    const nativeQuery = `
    SELECT
      count(*) AS coun,
      state AS Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count
    FROM people
    GROUP BY
      Total_number_of_people_from_each_state_separated_by_state_and_then_we_do_a_count`;
    cy.createNativeQuestion(
      {
        name: "People Model with long alias",
        native: {
          query: nativeQuery,
        },
      },
      { visitQuestion: true, wrapId: true },
    );

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();

    cy.get("@questionId").then(questionId => {
      cy.wait("@dataset").then(({ response }) => {
        expect(response.body.json_query.query["source-table"]).to.equal(
          `card__${questionId}`,
        );
        expect(response.body.error).to.not.exist;
      });
    });

    // Filtering on the long column is currently broken in master (metabase#47863),
    // but this works in the release-x.50.x branch.
    //
    // filter();
    // filterField(
    //   "TOTAL_NUMBER_OF_PEOPLE_FROM_EACH_STATE_SEPARATED_BY_STATE_AND_THEN_WE_DO_A_COUNT",
    //   {
    //     operator: "Contains",
    //     value: "A",
    //   },
    // );

    // cy.findByTestId("apply-filters").click();
    // cy.wait("@dataset").then(({ response }) => {
    //   expect(response.body.error).to.not.exist;
    // });

    H.filter();
    H.filterField("COUN", {
      operator: "Greater than",
      value: 30,
    });

    cy.findByTestId("apply-filters").click();
    cy.wait("@dataset").then(({ response }) => {
      expect(response.body.error).to.not.exist;
    });

    assertQuestionIsBasedOnModel({
      model: "People Model with long alias",
      collection: "Our analytics",
      table: "People",
    });

    cy.get("@questionId").then(questionId => {
      saveQuestionBasedOnModel({ modelId: questionId, name: "Q1" });
    });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "People Model with long alias",
      collection: "Our analytics",
      table: "People",
    });

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    getCollectionItemCard("People Model with long alias").within(() => {
      cy.icon("model");
    });
    getCollectionItemRow("Q1").icon("table2");

    cy.location("pathname").should("eq", "/collection/root");
  });

  it("changes model's display to table", () => {
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

    H.echartsContainer();
    // TODO (styles): migrate
    cy.get(".test-TableInteractive").should("not.exist");

    turnIntoModel();

    // TODO (styles): migrate
    cy.get(".test-TableInteractive");
    H.echartsContainer().should("not.exist");
  });

  it("allows to undo turning a question into a model", () => {
    H.visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    H.echartsContainer();

    turnIntoModel();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This is a model now.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Undo").click();

    H.echartsContainer();
    H.openQuestionActions();
    assertIsQuestion();
  });

  it("allows to turn a model back into a saved question", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("cardUpdate");
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);

    H.openQuestionActions();
    H.popover().within(() => {
      cy.findByText("Turn back to saved question").click();
    });

    cy.wait("@cardUpdate");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This is a question now.");
    H.openQuestionActions();
    assertIsQuestion();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    H.openQuestionActions();
    assertIsModel();
  });

  it("shows 404 when opening a question with a /dataset URL", () => {
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/We're a little lost/i);
  });

  it("redirects to /model URL when opening a model with /question URL", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    // Important - do not use visitQuestion(ORDERS_QUESTION_ID) here!
    cy.visit("/question/" + ORDERS_QUESTION_ID);
    cy.wait("@dataset");
    H.openQuestionActions();
    assertIsModel();
    cy.url().should("include", "/model");
  });

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*").as("search");
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    });

    it("transforms the data picker", () => {
      H.startNewQuestion();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Models").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("Orders Model").should("exist");
        cy.findByText("Orders, Count").should("not.exist");

        H.entityPickerModalTab("Saved questions").click();
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Orders Model").should("not.exist");
        cy.findByText("Orders, Count").should("exist");
        cy.findByText("Orders, Count, Grouped by Created At (year)").should(
          "exist",
        );
        cy.findByText("Products").should("exist");

        H.entityPickerModalTab("Tables").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");
        cy.findByText("Orders, Count").should("not.exist");

        cy.findByPlaceholderText("Search this database or everywhere…").type(
          "Ord",
        );
        cy.wait("@search");

        getResults().should("have.length", 1);
        cy.findByText("1 result").should("be.visible");
        getResults()
          .eq(0)
          .should("have.attr", "data-model-type", "table")
          .and("contain.text", "Orders");

        cy.findByText("Everywhere").click();
        getResults().should("have.length", 5);
        cy.findByText("5 results").should("be.visible");
        getResults()
          .eq(0)
          .should("have.attr", "data-model-type", "dataset")
          .and("contain.text", "Orders");
        getResults()
          .eq(1)
          .should("have.attr", "data-model-type", "table")
          .and("contain.text", "Orders");
        getResults()
          .eq(2)
          .should("have.attr", "data-model-type", "card")
          .and("contain.text", "Orders, Count");
        getResults()
          .eq(3)
          .should("have.attr", "data-model-type", "dataset")
          .and("contain.text", "Orders Model");
        getResults()
          .eq(4)
          .should("have.attr", "data-model-type", "card")
          .and("contain.text", "Orders, Count, Grouped by Created At (year)");
      });
    });

    it("allows to create a question based on a model", () => {
      cy.intercept(`/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as("schema");

      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Models").click();
        cy.findByText("Orders").click();
      });

      cy.icon("join_left_outer").click();
      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");

        cy.findByText("Products").click();
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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a function or metric").click();
      selectFromDropdown("Count of rows");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      H.visualize();
      H.echartsContainer();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      cy.findByTestId("save-question-modal").within(modal => {
        cy.findByText("Save").click();
      });

      cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
    });

    it("should not display models if nested queries are disabled", () => {
      H.mockSessionProperty("enable-nested-queries", false);
      H.startNewQuestion();
      H.entityPickerModal().within(() => {
        cy.findAllByRole("tab").should("not.exist");

        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");
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

    it("can create a question by filtering and summarizing a model", () => {
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      H.filter();
      H.filterField("Discount", {
        operator: "Not empty",
      });
      cy.findByTestId("apply-filters").click();
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

      saveQuestionBasedOnModel({ modelId: ORDERS_QUESTION_ID, name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/" + ORDERS_QUESTION_ID);
    });

    it("can create a question using table click actions", () => {
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

      saveQuestionBasedOnModel({ modelId: ORDERS_QUESTION_ID, name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/" + ORDERS_QUESTION_ID);
    });

    it("can edit model info", () => {
      cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("updateCard");
      cy.visit(`/model/${ORDERS_QUESTION_ID}`);
      cy.wait("@dataset");

      cy.findByTestId("saved-question-header-title").clear().type("M1").blur();
      cy.wait("@updateCard");

      H.questionInfoButton().click();

      cy.findByPlaceholderText("Add description").type("foo").blur();
      cy.wait("@updateCard");

      cy.findByDisplayValue("M1");
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("foo");
    });
  });

  it("shouldn't allow to turn native questions with variables into models", () => {
    cy.createNativeQuestion(
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    H.focusNativeEditor().type(
      "{leftarrow}{leftarrow}{backspace}{backspace}#1-orders",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click({ force: true });

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click({ force: true });
    });

    turnIntoModel();
    H.openQuestionActions();
    assertIsModel();
  });

  it("shouldn't allow using variables in native models", () => {
    cy.createNativeQuestion({
      native: { query: "SELECT * FROM products" },
    }).then(({ body: { id: modelId } }) => {
      cy.request("PUT", `/api/card/${modelId}`, { type: "model" }).then(() => {
        cy.visit(`/model/${modelId}/query`);
        H.focusNativeEditor().type("{movetoend}").type(" WHERE {{F", {
          parseSpecialCharSequences: false,
        });
        cy.findByTestId("tag-editor-sidebar").should("not.exist");
      });
    });
  });

  it("should correctly show native models for no-data users", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.createNativeQuestion({
      name: "TEST MODEL",
      type: "model",
      native: {
        query: "select * from orders",
      },
    }).then(({ body: { id: modelId } }) => {
      cy.signIn("nodata");
      cy.visit(`/model/${modelId}`);
      cy.wait("@cardQuery");
      cy.findByText(/This question is written in SQL/i).should("not.exist");
    });
  });

  it("should automatically pin newly created models", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);
    turnIntoModel();
    H.visitCollection("root");
    cy.findByTestId("pinned-items").within(() => {
      cy.findByText("Models");
      cy.findByText("A model");
    });
  });

  it("should undo pinning a question if turning into a model was undone", () => {
    H.visitQuestion(ORDERS_QUESTION_ID);

    turnIntoModel();
    H.undo();
    cy.wait("@cardUpdate");

    H.visitCollection("root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Useful data").should("not.exist");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A model").should("not.exist");
  });

  describe("listing", () => {
    const modelDetails = {
      name: "Orders Model 2",
      query: {
        "source-table": ORDERS_ID,
        limit: 5,
      },
      type: "model",
    };

    beforeEach(() => {
      cy.createQuestion(modelDetails, { wrapId: true, idAlias: "modelId" });
    });

    it("should allow adding models to dashboards", () => {
      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
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

    it("should allow using models in native queries", () => {
      cy.intercept("POST", "/api/dataset").as("query");
      cy.get("@modelId").then(id => {
        H.openNativeEditor().type(`select * from {{#${id}}}`, {
          parseSpecialCharSequences: false,
        });
      });
      cy.findByTestId("native-query-editor-container").icon("play").click();
      cy.wait("@query");
      cy.findByTestId("TableInteractive-root").within(() => {
        cy.findByText("USER_ID");
        cy.findByText("PRODUCT_ID");
        cy.findByText("TAX");
      });
    });
  });
});

function getCollectionItemRow(itemName) {
  return cy.findByText(itemName).closest("tr");
}

function getCollectionItemCard(itemName) {
  return cy.findByText(itemName).closest("a");
}

function getResults() {
  return cy.findAllByTestId("result-item");
}

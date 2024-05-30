import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_QUESTION_ID,
  ORDERS_BY_YEAR_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  modal,
  popover,
  openNativeEditor,
  visualize,
  mockSessionProperty,
  sidebar,
  summarize,
  filter,
  filterField,
  visitQuestion,
  visitDashboard,
  startNewQuestion,
  openQuestionActions,
  closeQuestionActions,
  visitCollection,
  undo,
  openQuestionsSidebar,
  editDashboard,
  getDashboardCard,
  saveDashboard,
  getNotebookStep,
  selectFilterOperator,
  focusNativeEditor,
  echartsContainer,
  entityPickerModal,
  questionInfoButton,
  entityPickerModalTab,
} from "e2e/support/helpers";

import {
  turnIntoModel,
  assertIsModel,
  assertQuestionIsBasedOnModel,
  selectFromDropdown,
  selectDimensionOptionFromSidebar,
  saveQuestionBasedOnModel,
  assertIsQuestion,
} from "./helpers/e2e-models-helpers";

const { PRODUCTS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > models", () => {
  beforeEach(() => {
    restore();
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
      visitQuestion(id);

      turnIntoModel();
      openQuestionActions();
      assertIsModel();

      filter();
      filterField("Vendor", {
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
    openQuestionActions();
    assertIsModel();

    filter();
    filterField("VENDOR", {
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

  it("changes model's display to table", () => {
    visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);

    echartsContainer();
    // TODO (styles): migrate
    cy.get(".test-TableInteractive").should("not.exist");

    turnIntoModel();

    // TODO (styles): migrate
    cy.get(".test-TableInteractive");
    echartsContainer().should("not.exist");
  });

  it("allows to undo turning a question into a model", () => {
    visitQuestion(ORDERS_BY_YEAR_QUESTION_ID);
    echartsContainer();

    turnIntoModel();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This is a model now.");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Undo").click();

    echartsContainer();
    openQuestionActions();
    assertIsQuestion();
  });

  it("allows to turn a model back into a saved question", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    cy.intercept("PUT", `/api/card/${ORDERS_QUESTION_ID}`).as("cardUpdate");
    cy.visit(`/model/${ORDERS_QUESTION_ID}`);

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Turn back to saved question").click();
    });

    cy.wait("@cardUpdate");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("This is a question now.");
    openQuestionActions();
    assertIsQuestion();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    openQuestionActions();
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
    openQuestionActions();
    assertIsModel();
    cy.url().should("include", "/model");
  });

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*").as("search");
      cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });
    });

    it("transforms the data picker", () => {
      startNewQuestion();

      entityPickerModal().within(() => {
        entityPickerModalTab("Models").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("Orders Model").should("exist");
        cy.findByText("Orders, Count").should("not.exist");

        entityPickerModalTab("Saved questions").click();
        cy.findByText("Orders").should("not.exist");
        cy.findByText("Orders Model").should("not.exist");
        cy.findByText("Orders, Count").should("exist");
        cy.findByText("Orders, Count, Grouped by Created At (year)").should(
          "exist",
        );
        cy.findByText("Products").should("exist");

        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");
        cy.findByText("Orders, Count").should("not.exist");

        testDataPickerSearch({
          query: "Ord",
          models: true,
          cards: true,
          tables: true,
        });
      });
    });

    it("allows to create a question based on a model", () => {
      cy.intercept(`/api/database/${SAMPLE_DB_ID}/schema/PUBLIC`).as("schema");

      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").click();
        cy.findByText("Orders").click();
      });

      cy.icon("join_left_outer").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").should("exist");
        cy.findByText("People").should("exist");
        cy.findByText("Products").should("exist");
        cy.findByText("Reviews").should("exist");

        cy.findByText("Products").click();
      });

      getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      popover().within(() => {
        cy.findByText("Product").click();
        cy.findByText("Price").click();
      });
      selectFilterOperator("Less than");
      popover().within(() => {
        cy.findByPlaceholderText("Enter a number").type("50");
        cy.button("Add filter").click();
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick the metric you want to see").click();
      selectFromDropdown("Count of rows");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      visualize();
      echartsContainer();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Save").click();

      cy.findByTestId("save-question-modal").within(modal => {
        cy.findByText("Save").click();
      });

      cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
    });

    it("should not display models if nested queries are disabled", () => {
      mockSessionProperty("enable-nested-queries", false);
      startNewQuestion();
      entityPickerModal().within(() => {
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

      filter();
      filterField("Discount", {
        operator: "Not empty",
      });
      cy.findByTestId("apply-filters").click();
      cy.wait("@dataset");

      assertQuestionIsBasedOnModel({
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      summarize();

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

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Subtotal").click();
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

      questionInfoButton().click();

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

    openQuestionActions();
    popover().within(() => {
      cy.icon("model").click();
    });
    modal().within(() => {
      cy.findByText("Variables in models aren't supported yet");
      cy.button("Turn this into a model").should("not.exist");
      cy.icon("close").click();
    });
    openQuestionActions();
    assertIsQuestion();
    closeQuestionActions();

    // Check card tags are supported by models
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Open editor/i).click();
    focusNativeEditor().type(
      "{leftarrow}{leftarrow}{backspace}{backspace}#1-orders",
    );
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Save").click({ force: true });

    cy.findByTestId("save-question-modal").within(modal => {
      cy.findByText("Save").click({ force: true });
    });

    turnIntoModel();
    openQuestionActions();
    assertIsModel();
  });

  it("shouldn't allow using variables in native models", () => {
    cy.createNativeQuestion({
      native: { query: "SELECT * FROM products" },
    }).then(({ body: { id: modelId } }) => {
      cy.request("PUT", `/api/card/${modelId}`, { type: "model" }).then(() => {
        cy.visit(`/model/${modelId}/query`);
        cy.get(".ace_editor:not(.ace_autocomplete)")
          .should("be.visible")
          .type("{movetoend}")
          .type(" WHERE {{F", {
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
    visitQuestion(ORDERS_QUESTION_ID);

    turnIntoModel();

    visitCollection("root");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Useful data");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("A model");
  });

  it("should undo pinning a question if turning into a model was undone", () => {
    visitQuestion(ORDERS_QUESTION_ID);

    turnIntoModel();
    undo();
    cy.wait("@cardUpdate");

    visitCollection("root");
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
        visitDashboard(dashboardId);
        editDashboard();
        openQuestionsSidebar();
        sidebar().findByText(modelDetails.name).click();
        getDashboardCard().within(() => {
          cy.findByText(modelDetails.name);
          cy.findByText("37.65");
        });
        saveDashboard();
        getDashboardCard().within(() => {
          cy.findByText(modelDetails.name);
          cy.findByText("37.65");
        });
      });
    });

    it("should allow using models in native queries", () => {
      cy.intercept("POST", "/api/dataset").as("query");
      cy.get("@modelId").then(id => {
        openNativeEditor().type(`select * from {{#${id}}}`, {
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
  return cy.findByText(itemName).parent();
}

function testDataPickerSearch({
  query,
  models = false,
  cards = false,
  tables = false,
} = {}) {
  cy.findByPlaceholderText("Search…").type(query);
  cy.wait("@search");

  const searchResultItems = cy.findAllByTestId("result-item");

  searchResultItems.then($results => {
    const modelTypes = {};

    for (const htmlElement of $results.toArray()) {
      const type = htmlElement.getAttribute("data-model-type");
      if (type in modelTypes) {
        modelTypes[type] += 1;
      } else {
        modelTypes[type] = 1;
      }
    }

    if (models) {
      expect(modelTypes["dataset"]).to.be.greaterThan(0);
    } else {
      expect(Object.keys(modelTypes)).not.to.include("dataset");
    }

    if (cards) {
      expect(modelTypes["card"]).to.be.greaterThan(0);
    } else {
      expect(Object.keys(modelTypes)).not.to.include("card");
    }

    if (tables) {
      expect(modelTypes["table"]).to.be.greaterThan(0);
    } else {
      expect(Object.keys(modelTypes)).not.to.include("table");
    }
  });
}

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
} from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { questionInfoButton } from "../../../__support__/e2e/helpers/e2e-ui-elements-helpers";

import {
  turnIntoModel,
  assertIsModel,
  assertQuestionIsBasedOnModel,
  selectFromDropdown,
  selectDimensionOptionFromSidebar,
  saveQuestionBasedOnModel,
  assertIsQuestion,
} from "./helpers/e2e-models-helpers";

const { PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > models", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("allows to turn a GUI question into a model", () => {
    cy.request("PUT", "/api/card/1", { name: "Orders Model" });
    visitQuestion(1);

    turnIntoModel();
    openQuestionActions();
    assertIsModel();

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

    saveQuestionBasedOnModel({ modelId: 1, name: "Q1" });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Orders Model",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    getCollectionItemRow("Orders Model").within(() => {
      cy.icon("model");
    });
    getCollectionItemRow("Q1").within(() => {
      cy.icon("table");
    });

    cy.url().should("not.include", "/question/1");
  });

  it("allows to turn a native question into a model", () => {
    cy.createNativeQuestion(
      {
        name: "Orders Model",
        native: {
          query: "SELECT * FROM orders",
        },
      },
      { visitQuestion: true },
    );

    turnIntoModel();
    openQuestionActions();
    assertIsModel();

    filter();
    filterField("DISCOUNT", {
      operator: "Not empty",
    });

    cy.findByTestId("apply-filters").click();
    cy.wait("@dataset");

    assertQuestionIsBasedOnModel({
      model: "Orders Model",
      collection: "Our analytics",
      table: "Orders",
    });

    saveQuestionBasedOnModel({ modelId: 4, name: "Q1" });

    assertQuestionIsBasedOnModel({
      questionName: "Q1",
      model: "Orders Model",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.findByTestId("qb-header").findAllByText("Our analytics").first().click();
    getCollectionItemRow("Orders Model").within(() => {
      cy.icon("model");
    });
    getCollectionItemRow("Q1").within(() => {
      cy.icon("table");
    });

    cy.location("pathname").should("eq", "/collection/root");
  });

  it("changes model's display to table", () => {
    visitQuestion(3);

    cy.get(".LineAreaBarChart");
    cy.get(".TableInteractive").should("not.exist");

    turnIntoModel();

    cy.get(".TableInteractive");
    cy.get(".LineAreaBarChart").should("not.exist");
  });

  it("allows to undo turning a question into a model", () => {
    visitQuestion(3);
    cy.get(".LineAreaBarChart");

    turnIntoModel();
    cy.findByText("This is a model now.");
    cy.findByText("Undo").click();

    cy.get(".LineAreaBarChart");
    openQuestionActions();
    assertIsQuestion();
  });

  it("allows to turn a model back into a saved question", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.intercept("PUT", "/api/card/1").as("cardUpdate");
    cy.visit("/model/1");

    openQuestionActions();
    popover().within(() => {
      cy.findByText("Turn back to saved question").click();
    });

    cy.wait("@cardUpdate");

    cy.findByText("This is a question now.");
    openQuestionActions();
    assertIsQuestion();

    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    openQuestionActions();
    assertIsModel();
  });

  it("shows 404 when opening a question with a /dataset URL", () => {
    cy.visit("/model/1");
    cy.findByText(/We're a little lost/i);
  });

  it("redirects to /model URL when opening a model with /question URL", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    // Important - do not use visitQuestion(1) here!
    cy.visit("/question/1");
    cy.wait("@dataset");
    openQuestionActions();
    assertIsModel();
    cy.url().should("include", "/model");
  });

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search*").as("search");
      cy.request("PUT", "/api/card/1", { dataset: true });
    });

    it("transforms the data picker", () => {
      startNewQuestion();

      popover().within(() => {
        testDataPickerSearch({
          inputPlaceholderText: "Search for some data…",
          query: "Ord",
          models: true,
          cards: true,
          tables: true,
        });

        cy.findByText("Models").click();
        cy.findByTestId("select-list").within(() => {
          cy.findByText("Orders");
          cy.findByText("Orders, Count").should("not.exist");
        });
        testDataPickerSearch({
          inputPlaceholderText: "Search for a model…",
          query: "Ord",
          models: true,
        });
        cy.icon("chevronleft").click();

        cy.findByText("Saved Questions").click();
        cy.findByTestId("select-list").within(() => {
          cy.findByText("Orders, Count");
          cy.findByText("Orders").should("not.exist");
        });
        testDataPickerSearch({
          inputPlaceholderText: "Search for a question…",
          query: "Ord",
          cards: true,
        });
        cy.icon("chevronleft").click();

        cy.findByText("Raw Data").click();
        cy.findByText("Sample Database").click(); // go back to db list
        cy.findByText("Saved Questions").should("not.exist");
        testDataPickerSearch({
          inputPlaceholderText: "Search for a table…",
          query: "Ord",
          tables: true,
        });
      });
    });

    it("allows to create a question based on a model", () => {
      cy.intercept("/api/database/1/schema/PUBLIC").as("schema");
      startNewQuestion();

      popover().within(() => {
        cy.findByText("Models").click();
        cy.findByText("Orders").click();
      });

      cy.icon("join_left_outer").click();
      cy.wait("@schema");
      cy.findAllByRole("option").should("have.length", 4);
      selectFromDropdown("Products");

      cy.findByText("Add filters to narrow your answer").click();
      selectFromDropdown("Products", { force: true });
      selectFromDropdown("Price", { force: true });
      selectFromDropdown("Equal to");
      selectFromDropdown("Less than");
      cy.findByPlaceholderText("Enter a number").type("50");
      cy.button("Add filter").click();

      cy.findByText("Pick the metric you want to see").click();
      selectFromDropdown("Count of rows");

      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      visualize();
      cy.get(".LineAreaBarChart");
      cy.findByText("Save").click();

      modal().within(() => {
        cy.button("Save").click();
      });

      cy.url().should("match", /\/question\/\d+-[a-z0-9-]*$/);
    });

    it("should not display models if nested queries are disabled", () => {
      mockSessionProperty("enable-nested-queries", false);
      startNewQuestion();
      popover().within(() => {
        cy.findByText("Models").should("not.exist");
        cy.findByText("Saved Questions").should("not.exist");
      });
    });
  });

  describe("simple mode", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", {
        name: "Orders Model",
        dataset: true,
      });
    });

    it("can create a question by filtering and summarizing a model", () => {
      cy.visit("/model/1");
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

      saveQuestionBasedOnModel({ modelId: 1, name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/1");
    });

    it("can create a question using table click actions", () => {
      cy.visit("/model/1");
      cy.wait("@dataset");

      cy.findByText("Subtotal").click();
      selectFromDropdown("Sum over time");

      assertQuestionIsBasedOnModel({
        questionName: "Sum of Subtotal by Created At: Month",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnModel({ modelId: 1, name: "Q1" });

      assertQuestionIsBasedOnModel({
        questionName: "Q1",
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/1");
    });

    it("can edit model info", () => {
      cy.intercept("PUT", "/api/card/1").as("updateCard");
      cy.visit("/model/1");
      cy.wait("@dataset");

      cy.findByTestId("saved-question-header-title").clear().type("M1").blur();
      cy.wait("@updateCard");

      questionInfoButton().click();

      cy.findByPlaceholderText("Add description").type("foo").blur();
      cy.wait("@updateCard");

      cy.findByDisplayValue("M1");
      cy.findByDisplayValue("foo");
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

    cy.findByText(/Open editor/i).click();
    cy.get(".ace_content").type(
      "{leftarrow}{leftarrow}{backspace}{backspace}#",
    );
    cy.findByTestId("tag-editor-sidebar").within(() => {
      cy.findByTestId("select-button").click();
    });
    selectFromDropdown("Orders");
    cy.findByText("Save").click();
    modal().findByText("Save").click();

    turnIntoModel();
    openQuestionActions();
    assertIsModel();
  });

  it("shouldn't allow using variables in native models", () => {
    cy.createNativeQuestion({
      native: { query: "SELECT * FROM products" },
    }).then(({ body: { id: modelId } }) => {
      cy.request("PUT", `/api/card/${modelId}`, { dataset: true }).then(() => {
        cy.visit(`/model/${modelId}/query`);
        cy.get(".ace_content")
          .should("be.visible")
          .as("editor")
          .type("{movetoend}")
          .type(" WHERE {{F", {
            parseSpecialCharSequences: false,
          });
        cy.findByTestId("tag-editor-sidebar").should("not.exist");
        cy.get("@editor").type("{leftarrow}{leftarrow}{backspace}#");
        cy.findByTestId("tag-editor-sidebar").should("be.visible");
      });
    });
  });

  it("should correctly show native models for no-data users", () => {
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.createNativeQuestion({
      name: "TEST MODEL",
      dataset: true,
      native: {
        query: "select * from orders",
      },
    });
    cy.signIn("nodata");
    cy.visit("/collection/root");
    cy.findByText("TEST MODEL").click();
    cy.wait("@cardQuery");
    cy.findByText(/This question is written in SQL/i).should("not.exist");
  });

  describe("listing", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", { name: "Orders Model", dataset: true });
    });

    it("should allow adding models to dashboards", () => {
      cy.intercept("GET", "/api/dashboard/*").as("fetchDashboard");

      cy.createDashboard().then(({ body: { id: dashboardId } }) => {
        visitDashboard(dashboardId);
        cy.icon("pencil").click();
        cy.get(".QueryBuilder-section .Icon-add").click();
        sidebar().findByText("Orders Model").click();
        cy.button("Save").click();
        // The first fetch happened when visiting dashboard, and the second one upon saving it.
        // We need to wait for both.
        cy.wait(["@fetchDashboard", "@fetchDashboard"]);
        cy.findByText("Orders Model");
      });
    });

    it("should allow using models in native queries", () => {
      cy.intercept("POST", "/api/dataset").as("query");
      openNativeEditor().type("select * from {{#}}", {
        parseSpecialCharSequences: false,
      });
      sidebar().contains("Pick a question or a model").click();
      selectFromDropdown("Orders Model");
      cy.get("@editor").contains("select * from {{#1}}");
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.wait("@query");
      cy.get(".TableInteractive").within(() => {
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

function testDataPickerSearch({
  inputPlaceholderText,
  query,
  models = false,
  cards = false,
  tables = false,
} = {}) {
  cy.findByPlaceholderText(inputPlaceholderText).type(query);
  cy.wait("@search");

  cy.findAllByText(/Model in/i).should(models ? "exist" : "not.exist");
  cy.findAllByText(/Saved question in/i).should(cards ? "exist" : "not.exist");
  cy.findAllByText(/Table in/i).should(tables ? "exist" : "not.exist");

  cy.icon("close").click();
}

import {
  restore,
  modal,
  popover,
  getNotebookStep,
  openNewCollectionItemFlowFor,
  visualize,
  mockSessionProperty,
} from "__support__/e2e/cypress";

import {
  turnIntoModel,
  assertIsModel,
  assertQuestionIsBasedOnModel,
  selectFromDropdown,
  selectDimensionOptionFromSidebar,
  saveQuestionBasedOnModel,
  assertIsQuestion,
  openDetailsSidebar,
  getDetailsSidebarActions,
} from "./helpers/e2e-models-helpers";

describe("scenarios > models", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows to turn a GUI question into a model", () => {
    cy.request("PUT", "/api/card/1", { name: "Orders Model" });
    cy.visit("/question/1");

    turnIntoModel();
    assertIsModel();

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("Discount");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

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

    cy.findAllByText("Our analytics")
      .first()
      .click();
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
    assertIsModel();

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("DISCOUNT");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

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

    cy.findAllByText("Our analytics")
      .first()
      .click();
    getCollectionItemRow("Orders Model").within(() => {
      cy.icon("model");
    });
    getCollectionItemRow("Q1").within(() => {
      cy.icon("table");
    });

    cy.url().should("not.include", "/question/1");
  });

  it("changes model's display to table", () => {
    cy.visit("/question/3");

    cy.get(".LineAreaBarChart");
    cy.get(".TableInteractive").should("not.exist");

    turnIntoModel();

    cy.get(".TableInteractive");
    cy.get(".LineAreaBarChart").should("not.exist");
  });

  it("allows to undo turning a question into a model", () => {
    cy.visit("/question/3");
    cy.get(".LineAreaBarChart");

    turnIntoModel();
    cy.findByText("This is a model now.");
    cy.findByText("Undo").click();

    cy.get(".LineAreaBarChart");
    assertIsQuestion();
  });

  it("allows to turn a model back into a saved question", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.intercept("PUT", "/api/card/1").as("cardUpdate");
    cy.visit("/model/1");

    openDetailsSidebar();
    cy.findByText("Turn back into a saved question").click();
    cy.wait("@cardUpdate");

    cy.findByText("This is a question now.");
    assertIsQuestion();

    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    assertIsModel();
  });

  it("shows 404 when opening a question with a /dataset URL", () => {
    cy.visit("/model/1");
    cy.findByText(/We're a little lost/i);
  });

  it("redirects to /model URL when opening a model with /question URL", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/question/1");
    openDetailsSidebar();
    assertIsModel();
    cy.url().should("include", "/model");
  });

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search").as("search");
      cy.request("PUT", "/api/card/1", { dataset: true });
    });

    it("transforms the data picker", () => {
      cy.visit("/question/new");
      cy.findByText("Custom question").click();

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
        cy.findByText("Sample Dataset").click(); // go back to db list
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
      cy.visit("/question/new");
      cy.findByText("Custom question").click();

      popover().within(() => {
        cy.findByText("Models").click();
        cy.findByText("Orders").click();
      });

      cy.icon("join_left_outer").click();
      cy.wait("@schema");
      selectFromDropdown("Products");

      cy.findByText("Add filters to narrow your answer").click();
      selectFromDropdown("Products");
      selectFromDropdown("Price");
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
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
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
      cy.visit("/question/1");

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").click();
      });
      selectDimensionOptionFromSidebar("Discount");
      cy.findByText("Equal to").click();
      selectFromDropdown("Not empty");
      cy.button("Add filter").click();

      assertQuestionIsBasedOnModel({
        model: "Orders Model",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Summarize").click();
      });
      selectDimensionOptionFromSidebar("Created At");
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
      cy.visit("/question/1");

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
      cy.visit("/question/1");

      openDetailsSidebar();
      getDetailsSidebarActions().within(() => {
        cy.icon("pencil").click();
      });
      modal().within(() => {
        cy.findByLabelText("Name")
          .clear()
          .type("M1");
        cy.findByLabelText("Description")
          .clear()
          .type("foo");
        cy.button("Save").click();
      });
      cy.wait("@updateCard");

      cy.findByText("M1");
      cy.findByText("foo");
    });
  });

  describe("adding a question to collection from its page", () => {
    it("should offer to pick one of the collection's models by default", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.request("PUT", "/api/card/2", { dataset: true });

      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      cy.findByText("Orders");
      cy.findByText("Orders, Count");
      cy.findByText("All data");

      cy.findByText("Models").should("not.exist");
      cy.findByText("Raw Data").should("not.exist");
      cy.findByText("Saved Questions").should("not.exist");
      cy.findByText("Sample Dataset").should("not.exist");

      cy.findByText("Orders").click();

      getNotebookStep("data").within(() => {
        cy.findByText("Orders");
      });

      cy.button("Visualize");
    });

    it("should open the default picker after clicking 'All data'", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.request("PUT", "/api/card/2", { dataset: true });

      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      cy.findByText("All data").click({ force: true });

      cy.findByText("Models");
      cy.findByText("Raw Data");
      cy.findByText("Saved Questions");
    });

    it("should automatically use the only collection model as a data source", () => {
      cy.request("PUT", "/api/card/2", { dataset: true });

      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      getNotebookStep("data").within(() => {
        cy.findByText("Orders, Count");
      });
      cy.button("Visualize");
    });

    it("should use correct picker if collection has no models", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });

      cy.visit("/collection/9");
      openNewCollectionItemFlowFor("question");

      cy.findByText("All data").should("not.exist");
      cy.findByText("Models");
      cy.findByText("Raw Data");
      cy.findByText("Saved Questions");
    });

    it("should use correct picker if there are models at all", () => {
      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      cy.findByText("All data").should("not.exist");
      cy.findByText("Models").should("not.exist");
      cy.findByText("Raw Data").should("not.exist");

      cy.findByText("Saved Questions");
      cy.findByText("Sample Dataset");
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

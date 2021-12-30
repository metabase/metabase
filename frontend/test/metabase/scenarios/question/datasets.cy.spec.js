import {
  restore,
  modal,
  popover,
  getNotebookStep,
  openNewCollectionItemFlowFor,
  visualize,
  runNativeQuery,
  mockSessionProperty,
} from "__support__/e2e/cypress";

describe("scenarios > datasets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows to turn a GUI question into a dataset", () => {
    cy.request("PUT", "/api/card/1", { name: "Orders Dataset" });
    cy.visit("/question/1");

    turnIntoDataset();
    assertIsDataset();

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("Discount");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

    assertQuestionIsBasedOnDataset({
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    saveQuestionBasedOnDataset({ datasetId: 1, name: "Q1" });

    assertQuestionIsBasedOnDataset({
      questionName: "Q1",
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.findAllByText("Our analytics")
      .first()
      .click();
    getCollectionItemRow("Orders Dataset").within(() => {
      cy.icon("dataset");
    });
    getCollectionItemRow("Q1").within(() => {
      cy.icon("table");
    });

    cy.url().should("not.include", "/question/1");
  });

  it("allows to turn a native question into a dataset", () => {
    cy.createNativeQuestion(
      {
        name: "Orders Dataset",
        native: {
          query: "SELECT * FROM orders",
        },
      },
      { visitQuestion: true },
    );

    turnIntoDataset();
    assertIsDataset();

    cy.findByTestId("qb-header-action-panel").within(() => {
      cy.findByText("Filter").click();
    });
    selectDimensionOptionFromSidebar("DISCOUNT");
    cy.findByText("Equal to").click();
    selectFromDropdown("Not empty");
    cy.button("Add filter").click();

    assertQuestionIsBasedOnDataset({
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    saveQuestionBasedOnDataset({ datasetId: 4, name: "Q1" });

    assertQuestionIsBasedOnDataset({
      questionName: "Q1",
      dataset: "Orders Dataset",
      collection: "Our analytics",
      table: "Orders",
    });

    cy.findAllByText("Our analytics")
      .first()
      .click();
    getCollectionItemRow("Orders Dataset").within(() => {
      cy.icon("dataset");
    });
    getCollectionItemRow("Q1").within(() => {
      cy.icon("table");
    });

    cy.url().should("not.include", "/question/1");
  });

  it("changes dataset's display to table", () => {
    cy.visit("/question/3");

    cy.get(".LineAreaBarChart");
    cy.get(".TableInteractive").should("not.exist");

    turnIntoDataset();

    cy.get(".TableInteractive");
    cy.get(".LineAreaBarChart").should("not.exist");
  });

  it("allows to undo turning a question into a dataset", () => {
    cy.visit("/question/3");
    cy.get(".LineAreaBarChart");

    turnIntoDataset();
    cy.findByText("This is a dataset now.");
    cy.findByText("Undo").click();

    cy.get(".LineAreaBarChart");
    assertIsQuestion();
  });

  it("allows to turn a dataset back into a saved question", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.intercept("PUT", "/api/card/1").as("cardUpdate");
    cy.visit("/dataset/1");

    openDetailsSidebar();
    cy.findByText("Turn back into a saved question").click();
    cy.wait("@cardUpdate");

    cy.findByText("This is a question now.");
    assertIsQuestion();

    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    assertIsDataset();
  });

  it("shows 404 when opening a question with a /dataset URL", () => {
    cy.visit("/dataset/1");
    cy.findByText(/We're a little lost/i);
  });

  it("redirects to /dataset URL when opening a dataset with /question URL", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });
    cy.visit("/question/1");
    openDetailsSidebar();
    assertIsDataset();
    cy.url().should("include", "/dataset");
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
          datasets: true,
          cards: true,
          tables: true,
        });

        cy.findByText("Datasets").click();
        cy.findByTestId("select-list").within(() => {
          cy.findByText("Orders");
          cy.findByText("Orders, Count").should("not.exist");
        });
        testDataPickerSearch({
          inputPlaceholderText: "Search for a model…",
          query: "Ord",
          datasets: true,
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

    it("allows to create a question based on a dataset", () => {
      cy.visit("/question/new");
      cy.findByText("Custom question").click();

      popover().within(() => {
        cy.findByText("Datasets").click();
        cy.findByText("Orders").click();
      });

      joinTable("Products");
      selectFromDropdown("Product ID");
      selectFromDropdown("ID");

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

    it("should not display datasets if nested queries are disabled", () => {
      mockSessionProperty("enable-nested-queries", false);
      cy.visit("/question/new");
      cy.findByText("Custom question").click();
      popover().within(() => {
        cy.findByText("Datasets").should("not.exist");
        cy.findByText("Saved Questions").should("not.exist");
      });
    });
  });

  describe("simple mode", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", {
        name: "Orders Dataset",
        dataset: true,
      });
    });

    it("can create a question by filtering and summarizing a dataset", () => {
      cy.visit("/question/1");

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").click();
      });
      selectDimensionOptionFromSidebar("Discount");
      cy.findByText("Equal to").click();
      selectFromDropdown("Not empty");
      cy.button("Add filter").click();

      assertQuestionIsBasedOnDataset({
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Summarize").click();
      });
      selectDimensionOptionFromSidebar("Created At");
      cy.button("Done").click();

      assertQuestionIsBasedOnDataset({
        questionName: "Count by Created At: Month",
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnDataset({ datasetId: 1, name: "Q1" });

      assertQuestionIsBasedOnDataset({
        questionName: "Q1",
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/1");
    });

    it("can create a question using table click actions", () => {
      cy.visit("/question/1");

      cy.findByText("Subtotal").click();
      selectFromDropdown("Sum over time");

      assertQuestionIsBasedOnDataset({
        questionName: "Sum of Subtotal by Created At: Month",
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnDataset({ datasetId: 1, name: "Q1" });

      assertQuestionIsBasedOnDataset({
        questionName: "Q1",
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/1");
    });

    it("can edit dataset info", () => {
      cy.intercept("PUT", "/api/card/1").as("updateCard");
      cy.visit("/question/1");

      openDetailsSidebar();
      getDetailsSidebarActions().within(() => {
        cy.icon("pencil").click();
      });
      modal().within(() => {
        cy.findByLabelText("Name")
          .clear()
          .type("D1");
        cy.findByLabelText("Description")
          .clear()
          .type("Some helpful dataset description");
        cy.button("Save").click();
      });
      cy.wait("@updateCard");

      cy.findByText("D1");
      cy.findByText("Some helpful dataset description");
    });
  });

  describe("adding a question to collection from its page", () => {
    it("should offer to pick one of the collection's datasets by default", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.request("PUT", "/api/card/2", { dataset: true });

      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      cy.findByText("Orders");
      cy.findByText("Orders, Count");
      cy.findByText("All data");

      cy.findByText("Datasets").should("not.exist");
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

      cy.findByText("Datasets");
      cy.findByText("Raw Data");
      cy.findByText("Saved Questions");
    });

    it("should automatically use the only collection dataset as a data source", () => {
      cy.request("PUT", "/api/card/2", { dataset: true });

      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      getNotebookStep("data").within(() => {
        cy.findByText("Orders, Count");
      });
      cy.button("Visualize");
    });

    it("should use correct picker if collection has no datasets", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });

      cy.visit("/collection/9");
      openNewCollectionItemFlowFor("question");

      cy.findByText("All data").should("not.exist");
      cy.findByText("Datasets");
      cy.findByText("Raw Data");
      cy.findByText("Saved Questions");
    });

    it("should use correct picker if there are datasets at all", () => {
      cy.visit("/collection/root");
      openNewCollectionItemFlowFor("question");

      cy.findByText("All data").should("not.exist");
      cy.findByText("Datasets").should("not.exist");
      cy.findByText("Raw Data").should("not.exist");

      cy.findByText("Saved Questions");
      cy.findByText("Sample Dataset");
    });
  });

  describe("revision history", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/3", {
        name: "Orders Dataset",
        dataset: true,
      });
      cy.intercept("PUT", "/api/card/3").as("updateCard");
      cy.intercept("POST", "/api/revision/revert").as("revertToRevision");
    });

    it("should allow reverting to a saved question state", () => {
      cy.visit("/question/3");
      openDetailsSidebar();
      assertIsDataset();

      cy.findByText("History").click();
      cy.button("Revert").click();
      cy.wait("@revertToRevision");

      assertIsQuestion();
      cy.get(".LineAreaBarChart");

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").click();
      });
      selectDimensionOptionFromSidebar("Discount");
      cy.findByText("Equal to").click();
      selectFromDropdown("Not empty");
      cy.button("Add filter").click();

      cy.findByText("Save").click();
      modal().within(() => {
        cy.findByText(/Replace original question/i);
      });
    });

    it("should allow reverting to a dataset state", () => {
      cy.request("PUT", "/api/card/3", { dataset: false });

      cy.visit("/question/3");
      openDetailsSidebar();
      assertIsQuestion();

      cy.findByText("History").click();
      cy.findByText(/Turned this into a dataset/i)
        .closest("li")
        .within(() => {
          cy.button("Revert").click();
        });
      cy.wait("@revertToRevision");

      assertIsDataset();
      cy.get(".LineAreaBarChart").should("not.exist");

      cy.findByTestId("qb-header-action-panel").within(() => {
        cy.findByText("Filter").click();
      });
      selectDimensionOptionFromSidebar("Count");
      cy.findByText("Equal to").click();
      selectFromDropdown("Greater than");
      cy.findByPlaceholderText("Enter a number").type("2000");
      cy.button("Add filter").click();

      assertQuestionIsBasedOnDataset({
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      saveQuestionBasedOnDataset({ datasetId: 3, name: "Q1" });

      assertQuestionIsBasedOnDataset({
        questionName: "Q1",
        dataset: "Orders Dataset",
        collection: "Our analytics",
        table: "Orders",
      });

      cy.url().should("not.include", "/question/3");
    });
  });

  describe("query editor", () => {
    beforeEach(() => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("allows to edit GUI dataset query", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.visit("/dataset/1");

      openDetailsSidebar();
      cy.findByText("Edit query definition").click();

      getNotebookStep("data").findByText("Orders");
      cy.get(".TableInteractive");
      cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);

      cy.findByTestId("action-buttons")
        .findByText("Summarize")
        .click();
      selectFromDropdown("Count of rows");
      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      cy.get(".RunButton").click();

      cy.get(".TableInteractive").within(() => {
        cy.findByText("Created At: Month");
        cy.findByText("Count");
      });
      cy.get(".TableInteractive-headerCellData").should("have.length", 2);

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.url().should("include", "/dataset/1");
      cy.url().should("not.include", "/query");

      cy.visit("/dataset/1/query");
      getNotebookStep("summarize").within(() => {
        cy.findByText("Created At: Month");
        cy.findByText("Count");
      });
      cy.get(".TableInteractive").within(() => {
        cy.findByText("Created At: Month");
        cy.findByText("Count");
      });

      cy.button("Cancel").click();
      cy.url().should("include", "/dataset/1");
      cy.url().should("not.include", "/query");

      cy.go("back");
      cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);
    });

    it("locks display to table", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });
      cy.visit("/dataset/1/query");

      cy.findByTestId("action-buttons")
        .findByText("Join data")
        .click();
      selectFromDropdown("People");

      cy.button("Save changes").click();
      openDetailsSidebar();
      cy.findByText("Edit query definition").click();

      cy.findByTestId("action-buttons")
        .findByText("Summarize")
        .click();
      selectFromDropdown("Count of rows");
      cy.findByText("Pick a column to group by").click();
      selectFromDropdown("Created At");

      cy.get(".RunButton").click();
      cy.wait("@dataset");

      cy.get(".LineAreaBarChart").should("not.exist");
      cy.get(".TableInteractive");
    });

    it("allows to edit native dataset query", () => {
      cy.createNativeQuestion(
        {
          name: "Native DS",
          dataset: true,
          native: {
            query: "SELECT * FROM orders",
          },
        },
        { visitQuestion: true },
      );

      openDetailsSidebar();
      cy.findByText("Edit query definition").click();

      cy.get(".ace_content").as("editor");
      cy.get(".TableInteractive");
      cy.url().should("match", /\/dataset\/[1-9]\d*.*\/query/);

      cy.get("@editor").type(
        " LEFT JOIN products ON orders.PRODUCT_ID = products.ID",
      );
      runNativeQuery();

      cy.get(".TableInteractive").within(() => {
        cy.findByText("EAN");
        cy.findByText("TOTAL");
      });

      cy.button("Save changes").click();
      cy.wait("@updateCard");

      cy.url().should("match", /\/dataset\/[1-9]\d*.*\d/);
      cy.url().should("not.include", "/query");

      cy.findByText("Edit query definition").click();

      cy.get(".TableInteractive").within(() => {
        cy.findByText("EAN");
        cy.findByText("TOTAL");
      });

      cy.button("Cancel").click();
      cy.url().should("match", /\/dataset\/[1-9]\d*.*\d/);
      cy.url().should("not.include", "/query");
    });
  });
});

function assertQuestionIsBasedOnDataset({
  questionName,
  collection,
  dataset,
  table,
}) {
  if (questionName) {
    cy.findByText(questionName);
  }

  // Asserts shows dataset and its collection names
  // instead of db + table
  cy.findAllByText(collection);
  cy.findByText(dataset);

  cy.findByText("Sample Dataset").should("not.exist");
  cy.findByText(table).should("not.exist");
}

function assertCreatedNestedQuery(datasetId) {
  cy.wait("@createCard").then(({ request }) => {
    expect(request.body.dataset_query.query["source-table"]).to.equal(
      `card__${datasetId}`,
    );
  });
}

function saveQuestionBasedOnDataset({ datasetId, name }) {
  cy.intercept("POST", "/api/card").as("createCard");

  cy.findByText("Save").click();

  modal().within(() => {
    cy.findByText(/Replace original question/i).should("not.exist");
    if (name) {
      cy.findByLabelText("Name")
        .clear()
        .type(name);
    }
    cy.findByText("Save").click();
  });

  assertCreatedNestedQuery(datasetId);

  modal()
    .findByText("Not now")
    .click();
}

function selectDimensionOptionFromSidebar(name) {
  cy.get("[data-testid=dimension-list-item]")
    .contains(name)
    .click();
}

function openDetailsSidebar() {
  cy.findByTestId("saved-question-header-button").click();
}

function getDetailsSidebarActions() {
  return cy.findByTestId("question-action-buttons");
}

// Requires dataset details sidebar to be open
function assertIsDataset() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset").should("not.exist");
  });
  cy.findByText("Dataset management");
  cy.findByText("Sample Dataset").should("not.exist");

  // For native
  cy.findByText("This question is written in SQL.").should("not.exist");
  cy.get("ace_content").should("not.exist");
}

// Requires question details sidebar to be open
function assertIsQuestion() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset");
  });
  cy.findByText("Dataset management").should("not.exist");
  cy.findByText("Sample Dataset");
}

function turnIntoDataset() {
  openDetailsSidebar();
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset").click();
  });
  modal().within(() => {
    cy.button("Turn this into a dataset").click();
  });
}

function getCollectionItemRow(itemName) {
  return cy.findByText(itemName).closest("tr");
}

function selectFromDropdown(option, clickOpts) {
  popover()
    .findByText(option)
    .click(clickOpts);
}

function joinTable(table) {
  cy.icon("join_left_outer").click();
  selectFromDropdown(table);
}

function testDataPickerSearch({
  inputPlaceholderText,
  query,
  datasets = false,
  cards = false,
  tables = false,
} = {}) {
  cy.findByPlaceholderText(inputPlaceholderText).type(query);
  cy.wait("@search");

  cy.findAllByText(/Dataset in/i).should(datasets ? "exist" : "not.exist");
  cy.findAllByText(/Saved question in/i).should(cards ? "exist" : "not.exist");
  cy.findAllByText(/Table in/i).should(tables ? "exist" : "not.exist");

  cy.icon("close").click();
}

import {
  restore,
  modal,
  popover,
  getNotebookStep,
  openNewCollectionItemFlowFor,
  visualize,
} from "__support__/e2e/cypress";

describe("scenarios > datasets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows to turn a question into a dataset", () => {
    cy.visit("/question/1");

    turnIntoDataset();
    assertIsDataset();

    cy.findByText("Our analytics").click();
    getCollectionItemRow("Orders").within(() => {
      cy.icon("dataset");
    });
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
    cy.visit("/question/1");

    openDetailsSidebar();
    cy.findByText("Turn back into a saved question").click();
    cy.wait("@cardUpdate");

    cy.findByText("This is a question now.");
    assertIsQuestion();

    cy.findByText("Undo").click();
    cy.wait("@cardUpdate");
    assertIsDataset();
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
        cy.findByText("Sample Dataset");
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
});

function openDetailsSidebar() {
  cy.findByTestId("saved-question-header-button").click();
}

function getDetailsSidebarActions(iconName) {
  return cy.findByTestId("question-action-buttons");
}

// Requires dataset details sidebar to be open
function assertIsDataset() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset").should("not.exist");
  });
  cy.findByText("Dataset management");
}

// Requires question details sidebar to be open
function assertIsQuestion() {
  getDetailsSidebarActions().within(() => {
    cy.icon("dataset");
  });
  cy.findByText("Dataset management").should("not.exist");
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

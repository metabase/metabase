import { restore, modal, popover } from "__support__/e2e/cypress";

describe("scenarios > datasets", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("allows to turn a question into a dataset", () => {
    cy.visit("/question/1");
    turnIntoDataset();
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

  describe("data picker", () => {
    beforeEach(() => {
      cy.intercept("GET", "/api/search").as("search");
    });

    it("remains the same when there are no datasets", () => {
      cy.visit("/question/new");
      cy.findByText("Custom question").click();

      popover().within(() => {
        cy.findByText("Sample Dataset");
        cy.findByText("Saved Questions");

        testDataPickerSearch({
          inputPlaceholderText: "Search for a table...",
          query: "Ord",
          cards: true,
          tables: true,
        });
      });
    });

    it("transforms the data picker", () => {
      cy.request("PUT", "/api/card/1", { dataset: true });

      cy.visit("/question/new");
      cy.findByText("Custom question").click();

      popover().within(() => {
        testDataPickerSearch({
          inputPlaceholderText: "Search for some data...",
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
          inputPlaceholderText: "Search for a model...",
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
          inputPlaceholderText: "Search for a question...",
          query: "Ord",
          cards: true,
        });
        cy.icon("chevronleft").click();

        cy.findByText("Raw Data").click();
        cy.findByText("Sample Dataset");
        cy.findByText("Saved Questions").should("not.exist");
        testDataPickerSearch({
          inputPlaceholderText: "Search for a table...",
          query: "Ord",
          tables: true,
        });
      });
    });
  });
});

function turnIntoDataset() {
  cy.findByTestId("saved-question-header-button").click();
  cy.icon("dataset").click();
  modal().within(() => {
    cy.button("Turn this into a dataset").click();
  });
}

function getCollectionItemRow(itemName) {
  return cy.findByText(itemName).closest("tr");
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

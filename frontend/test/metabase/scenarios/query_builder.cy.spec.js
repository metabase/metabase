import { signInAsAdmin } from "__support__/cypress";

describe("query builder", () => {
  beforeEach(signInAsAdmin);

  describe("browse data", () => {
    it("should load orders table and summarize", () => {
      cy.visit("/");
      cy.contains("Browse Data").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });
  });
  describe("ask a (simple) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Simple question").click();
      maybeClickSampleDataset();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });

    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      maybeClickSampleDataset();
      cy.contains("Orders").click();
      cy.contains("Visualize").click();
      cy.contains("37.65");
    });

    it("should summarize and break out and show a map", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      maybeClickSampleDataset();
      cy.contains("Orders").click();
      cy.contains("Pick the metric you want to see").click();
      cy.contains("Count of rows").click();
      cy.contains("Pick a column to group by").click();
      cy.contains(/^User$/).click();
      cy.contains("State").click();
      cy.contains("Visualize").click();
      cy.contains("1,342 +");
    });
  });

  describe("view mode", () => {
    describe("summarize sidebar", () => {
      it("should summarize by category and show a bar chart", () => {
        cy.server();
        cy.route("POST", "/api/dataset").as("dataset");
        loadOrdersTable();
        cy.wait("@dataset");
        cy.contains("Summarize").click();
        cy.contains("Category").click();
        cy.contains("Done").click();
        cy.contains("Count by Product → Category");
      });
    });

    describe("filter sidebar", () => {
      it("should filter a table", () => {
        loadOrdersTable();
        cy.contains("Filter").click();
        cy.contains("Vendor").click();
        cy.get("input[placeholder='Search by Vendor']")
          .clear()
          .type("Alfreda Konopelski II Group")
          .blur();
        cy.contains("Add filter").click();
        cy.contains("Showing 91 rows");
      });
    });
  });

  describe("column settings", () => {
    it("should allow you to remove a column and add two foreign columns", () => {
      // oddly specific test inspired by https://github.com/metabase/metabase/issues/11499

      // get a really wide window, so we don't need to mess with scrolling the table horizontally
      cy.viewport(1600, 800);

      loadOrdersTable();
      cy.contains("Settings").click();

      // wait for settings sidebar to open
      cy.get(".border-right.overflow-x-hidden")
        .invoke("width")
        .should("be.gt", 350);

      cy.contains("Table options")
        .parents(".scroll-y")
        .first()
        .as("tableOptions");

      // remove Total column
      cy.get("@tableOptions")
        .contains("Total")
        .scrollIntoView()
        .nextAll(".Icon-close")
        .click();

      // Add people.category
      cy.get("@tableOptions")
        .contains("Category")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Category value to appear in the table, so we know the query completed
      cy.contains("Widget");

      // Add people.ean
      cy.get("@tableOptions")
        .contains("Ean")
        .scrollIntoView()
        .nextAll(".Icon-add")
        .click();

      // wait a Ean value to appear in the table, so we know the query completed
      cy.contains("8833419218504");

      // confirm that the table contains the right columns
      cy.get(".Visualization .TableInteractive").as("table");
      cy.get("@table").contains("Product → Category");
      cy.get("@table").contains("Product → Ean");
      cy.get("@table")
        .contains("Total")
        .should("not.exist");
    });
  });
});

function loadOrdersTable() {
  cy.visit("/");
  cy.contains("Browse Data").click();
  cy.contains("Sample Dataset").click();
  cy.contains("Orders").click();
}

// This isn't needed if there's only one db. In that case, clicking "Sample
// Dataset" will actually take you back to select a db again.
function maybeClickSampleDataset() {
  cy.contains("Sample Dataset").then($btn => {
    if ($btn.hasClass("List-section-title")) {
      $btn.click();
    }
  });
}

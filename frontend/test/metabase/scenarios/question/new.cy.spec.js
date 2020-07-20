import {
  restore,
  signInAsAdmin,
  popover,
  openOrdersTable,
} from "__support__/cypress";

// test various entry points into the query builder

describe("scenarios > question > new", () => {
  before(restore);
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
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("37.65");
    });

    it.skip("should remove `/notebook` from URL when converting question to SQL/Native (Issue #12651)", () => {
      cy.server();
      cy.route("POST", "/api/dataset").as("dataset");
      openOrdersTable();
      cy.wait("@dataset");
      cy.url().should("include", "question#");
      // Isolate icons within "QueryBuilder" scope because there is also `.Icon-sql` in top navigation
      cy.get(".QueryBuilder .Icon-notebook").click();
      cy.url().should("include", "question/notebook#");
      cy.get(".QueryBuilder .Icon-sql").click();
      cy.findByText("Convert this question to SQL").click();
      cy.url().should("include", "question#");
    });
  });

  describe("ask a (custom) question", () => {
    it("should load orders table", () => {
      cy.visit("/");
      cy.contains("Ask a question").click();
      cy.contains("Custom question").click();
      cy.contains("Sample Dataset").click();
      cy.contains("Orders").click();
      cy.contains("Visualize").click();
      cy.contains("37.65");
    });

    it("should allow using `Custom Expression` in orders metrics", () => {
      // go straight to "orders" in custom questions
      cy.visit("/question/new?database=1&table=2&mode=notebook");
      cy.findByText("Summarize").click();
      popover()
        .contains("Custom Expression")
        .click();
      popover().within(() => {
        cy.get("[contentEditable=true]").type("2 * Max([Total])");
        cy.findByPlaceholderText("Name (required)").type("twice max total");
        cy.findByText("Done").click();
      });
      cy.findByText("Visualize").click();
      cy.findByText("604.96");
    });
  });
});

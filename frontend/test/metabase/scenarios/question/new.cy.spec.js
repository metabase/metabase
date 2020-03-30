import { restore, signInAsAdmin } from "__support__/cypress";

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
  });
});

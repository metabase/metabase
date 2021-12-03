import { restore } from "__support__/e2e/cypress";

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should show sections for an admin", () => {
      cy.visit("/");

      cy.findByText("Start here");
      cy.findByText("Add my data");

      cy.findByText("Try these x-rays based on your data");
      cy.findByText("Orders table");

      cy.findByText("Our analytics");
      cy.findByText("First collection");
      cy.findByText("Browse all items");

      cy.findByText("Our data");
      cy.findByText("Sample Dataset");
      cy.findByText("Add a database");
    });
  });

  describe("as normal user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should show sections for a normal user", () => {
      cy.visit("/");

      cy.findByText("Start here");
      cy.findByText("Your teams’ most important dashboards go here");

      cy.findByText("Try these x-rays based on your data");
      cy.findByText("Orders table");

      cy.findAllByText("Our analytics");
      cy.findByText("First collection");
      cy.findByText("Browse all items");

      cy.findByText("Our data");
      cy.findByText("Sample Dataset");
      cy.findByText("Add a database").should("not.exist");
    });
  });
});

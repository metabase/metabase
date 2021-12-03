import { restore } from "__support__/e2e/cypress";

describe("scenarios > home > homepage", () => {
  beforeEach(() => {
    restore();
  });

  describe("as admin", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
    });

    it("should allow basic navigation", () => {
      cy.visit("/");
      cy.findByText("Add my data").click();
      cy.location("pathname").should("eq", "admin/databases/create");

      cy.visit("/");
      cy.findByText("Invite a teammate").click();
      cy.location("pathname").should("eq", "/admin/people/new");

      cy.visit("/");
      cy.findByText("Products table");
      cy.location("pathname").should("eq", "/auto/dashboard/table/1");

      cy.visit("/");
      cy.findByText("Browse all items");
      cy.location("pathname").should("eq", "/collection/root");

      cy.visit("/");
      cy.findByText("Sample Dataset").click();
      cy.location("pathname").should("eq", "/browse/1-sample-dataset");

      cy.visit("/");
      cy.findByText("Add a database").click();
      cy.location("pathname").should("eq", "admin/databases/create");
    });

    it("should allow hiding the data section", () => {
      cy.visit("/");

      cy.findByText("Our data")
        .parent()
        .within(() => cy.findByLabelText("close icon").click());

      cy.findByText("Remove").click();
      cy.findByText("Our data").should("not.exist");
    });

    it("should allow hiding the x-ray section", () => {
      cy.visit("/");

      cy.findByText("Try these x-rays based on your data")
        .parent()
        .within(() => cy.findByLabelText("close icon").click());

      cy.findByText("Remove").click();
      cy.findByText("Try these x-rays based on your data").should("not.exist");
    });
  });

  describe("as normal user", () => {
    beforeEach(() => {
      cy.signInAsNormalUser();
    });

    it("should allow basic navigation", () => {
      cy.visit("/");
      cy.findByRole("link", { name: "Our analytics" }).click();
      cy.location("pathname").should("eq", "/collection/root");

      cy.visit("/");
      cy.findByText("Products table");
      cy.location("pathname").should("eq", "/auto/dashboard/table/1");

      cy.visit("/");
      cy.findByText("Browse all items");
      cy.location("pathname").should("eq", "/collection/root");

      cy.visit("/");
      cy.findByText("Sample Dataset").click();
      cy.location("pathname").should("eq", "/browse/1-sample-dataset");
    });
  });
});

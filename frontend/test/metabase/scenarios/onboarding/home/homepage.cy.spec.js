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
      cy.findByText("Need help setting up your database?");

      cy.visit("/");
      cy.findByText("invite a teammate").click();
      cy.findByText("New user");

      cy.visit("/");
      cy.findByText("Products table").click();
      cy.findByText("Here's a quick look at your Products table");

      cy.visit("/");
      cy.findByText("Browse all items").click();
      cy.findByText("Your personal collection");
      cy.findByText("Other users' personal collections");

      cy.visit("/");
      cy.findByText("Sample Dataset").click();
      cy.findByText("Learn about our data");

      cy.visit("/");
      cy.findByText("Add a database").click();
      cy.findByText("Need help setting up your database?");
    });

    it("should show pinned dashboards", () => {
      cy.createDashboard({
        name: "Pinned dashboard",
        collection_position: 1,
      });

      cy.visit("/");
      cy.findByText("Pinned dashboard").click();
      cy.findByText("This dashboard is looking empty.");
    });

    it("should allow hiding the data section", () => {
      cy.visit("/");

      clickOnCloseIconInSection("Our data");
      cy.findByText("Remove").click();
      cy.findByText("Our data").should("not.exist");
    });

    it("should allow hiding the x-ray section", () => {
      cy.visit("/");

      clickOnCloseIconInSection("Try these x-rays based on your data");
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
      cy.findByText("Your personal collection");

      cy.visit("/");
      cy.findByText("Products table").click();
      cy.findByText("Here's a quick look at your Products table");

      cy.visit("/");
      cy.findByText("Browse all items").click();
      cy.findByText("Your personal collection");

      cy.visit("/");
      cy.findByText("Sample Dataset").click();
      cy.findByText("Learn about our data");
    });

    it("should hide admin controls", () => {
      cy.visit("/");

      cy.findByText("Start here");
      cy.findByText("Add my data").should("not.exist");

      cy.findByText("Our data");
      cy.findByText("Add a database").should("not.exist");
    });

    it("should show pinned dashboards", () => {
      cy.createDashboard({
        name: "Pinned dashboard",
        collection_position: 1,
      });

      cy.visit("/");
      cy.findByText("Pinned dashboard").click();
      cy.findByText("This dashboard is looking empty.");
    });
  });
});

const clickOnCloseIconInSection = name => {
  cy.findByText(name)
    .parent()
    .realHover()
    .within(() => cy.findByLabelText("close icon").click());
};

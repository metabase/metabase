import { restore } from "e2e/support/helpers";

describe("scenarios > browse data", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("can browse to a model", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.location("pathname").should("eq", "/browse/models");
    cy.findByTestId("browse-app").findByText("Browse data");
    cy.findByRole("heading", { name: "Orders Model" }).click();
    cy.findByRole("button", { name: "Filter" });
  });
  it("can view summary of model's last edit", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.findByRole("note", /Bobby Tables/).realHover();
    cy.findByRole("tooltip", { name: /Last edited by Bobby Tables/ });
  });
  it("can browse to a database", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.findByRole("tab", { name: "Databases" }).click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("button", { name: "Summarize" });
    cy.findByRole("link", { name: /Sample Database/ }).click();
  });
  it("can visit 'Learn about our data' page", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.location("pathname").should("eq", "/reference/databases");
    cy.go("back");
    cy.findByRole("tab", { name: "Databases" }).click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("gridcell", { name: "Rustic Paper Wallet" });
  });
  it("the Browse data page shows the last-used tab by default", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.log(
      "/browse/ defaults to /browse/models/ because no tabs have been visited yet and there are some models to show",
    );
    cy.location("pathname").should("eq", "/browse/models");
    cy.findByRole("tab", { name: "Databases" }).click();
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.log(
      "/browse/ now defaults to /browse/databases/ because it was the last tab visited",
    );
    cy.location("pathname").should("eq", "/browse/databases");
    cy.findByRole("tab", { name: "Models" }).click();
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.log(
      "/browse/ now defaults to /browse/models/ because it was the last tab visited",
    );
    cy.location("pathname").should("eq", "/browse/models");
  });
});

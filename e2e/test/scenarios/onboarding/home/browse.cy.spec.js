import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  describeWithSnowplow,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  resetSnowplow,
  restore,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describeWithSnowplow("scenarios > browse data", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();
  });
  it("can browse to a table", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("button", { name: "Summarize" });
    cy.findByRole("link", { name: /Sample Database/ }).click();
    expectNoBadSnowplowEvents();
    expectGoodSnowplowEvent({
      event: "browse_data_table_clicked",
      table_id: PRODUCTS_ID,
    });
  });
  it("can visit 'Learn about our data' page", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse data" }).click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.location("pathname").should("eq", "/reference/databases");
    cy.go("back");
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("gridcell", { name: "Rustic Paper Wallet" });
  });
});

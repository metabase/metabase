import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import {
  restore,
  setTokenFeatures,
  describeWithSnowplow,
  describeWithSnowplowEE,
  expectGoodSnowplowEvent,
  resetSnowplow,
  expectNoBadSnowplowEvents,
  enableTracking,
  browseDatabases,
  navigationSidebar,
} from "e2e/support/helpers";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describeWithSnowplow("scenarios > browse", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();
  });

  it("can browse to a model", () => {
    cy.visit("/");
    navigationSidebar().findByLabelText("Browse models").click();
    cy.location("pathname").should("eq", "/browse/models");
    cy.findByRole("heading", { name: "Orders Model" }).click();
    cy.url().should("include", `/model/${ORDERS_MODEL_ID}-`);
    expectNoBadSnowplowEvents();
    expectGoodSnowplowEvent({
      event: "browse_data_model_clicked",
      model_id: ORDERS_MODEL_ID,
    });
  });

  it("can browse to a table in a database", () => {
    cy.visit("/");
    browseDatabases().click();
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

  it("browsing to a database only triggers a request for schemas for that specific database", () => {
    cy.intercept("GET", "/api/database/1/schemas").as(
      "schemasForSampleDatabase",
    );
    cy.intercept(
      "GET",
      /\/api\/database\/(?!1\b)\d+\/schemas/,
      cy.spy().as("schemasForOtherDatabases"),
    );
    cy.visit("/");
    browseDatabases().click();
    cy.findByRole("link", { name: /Sample Database/ }).click();
    cy.wait("@schemasForSampleDatabase");
    cy.get("@schemasForOtherDatabases").should("not.have.been.called");
  });

  it("can visit 'Learn about our data' page", () => {
    cy.visit("/");
    browseDatabases().click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.location("pathname").should("eq", "/reference/databases");
    cy.go("back");
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("gridcell", { name: "Rustic Paper Wallet" });
  });

  it("on an open-source instance, the Browse models page has no controls for setting filters", () => {
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse models" }).click();
    cy.findByRole("button", { name: /filter icon/i }).should("not.exist");
    cy.findByRole("switch", { name: /Only show verified models/ }).should(
      "not.exist",
    );
  });
});

describeWithSnowplowEE("scenarios > browse (EE)", () => {
  beforeEach(() => {
    resetSnowplow();
    restore();
    cy.signInAsAdmin();
    enableTracking();
  });

  it("/browse/models allows models to be filtered, on an enterprise instance", () => {
    const openFilterPopover = () =>
      cy.findByRole("button", { name: /filter icon/i }).click();
    const toggle = () =>
      cy.findByRole("switch", { name: /Only show verified models/ });
    setTokenFeatures("all");
    cy.visit("/");
    cy.findByRole("listitem", { name: "Browse models" }).click();
    cy.findByRole("heading", { name: "Our analytics" }).should("not.exist");
    cy.findByRole("heading", { name: "Orders Model" }).should("not.exist");
    openFilterPopover();
    toggle().next("label").click();
    cy.findByRole("heading", { name: "Orders Model" }).click();
    cy.findByLabelText("Move, trash, and more...").click();
    cy.findByRole("dialog", {
      name: /ellipsis icon/i,
    })
      .findByText(/Verify this model/)
      .click();
    cy.visit("/browse");
    openFilterPopover();
    toggle().next("label").click();
    cy.findByRole("heading", { name: "Orders Model" }).should("be.visible");
  });
});

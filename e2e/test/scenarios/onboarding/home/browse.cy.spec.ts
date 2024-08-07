import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import {
  browseDatabases,
  describeWithSnowplow,
  describeWithSnowplowEE,
  enableTracking,
  expectGoodSnowplowEvent,
  expectNoBadSnowplowEvents,
  navigationSidebar,
  resetSnowplow,
  restore,
  setTokenFeatures,
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
    navigationSidebar().findByLabelText("Browse models").click();
    cy.findByRole("button", { name: /filter icon/i }).should("not.exist");
    cy.findByRole("switch", { name: /Show verified models only/ }).should(
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
    setTokenFeatures("all");
    cy.intercept("PUT", "/api/setting/browse-filter-only-verified-models").as(
      "updateFilter",
    );
    cy.intercept("POST", "/api/moderation-review").as("updateVerification");
  });
  const openFilterPopover = () =>
    cy.findByRole("button", { name: /filter icon/i }).click();
  const toggle = () =>
    cy.findByRole("switch", { name: /Show verified models only/ });

  const recentsGrid = () => cy.findByRole("grid", { name: "Recents" });
  const modelsTable = () => cy.findByRole("table", { name: "Table of models" });
  const productsModel = () =>
    modelsTable().findByRole("heading", { name: "Products Model" });
  const recentProductsModel = () => recentsGrid().findByText("Products Model");
  const ordersModel = () =>
    modelsTable().findByRole("heading", { name: "Orders Model" });
  const recentOrdersModel = () => recentsGrid().findByText("Orders Model");
  const productsModelRow = () =>
    modelsTable().findByRole("row", { name: /Products Model/i });
  const ordersModelRow = () =>
    modelsTable().findByRole("row", { name: /Orders Model/i });
  const filterButton = () =>
    cy
      .findByTestId("browse-models-header")
      .findByRole("button", { name: /filter icon/i });

  const setVerification = (linkSelector: RegExp | string) => {
    cy.findByLabelText("Move, trash, and more...").click();
    cy.findByRole("dialog", {
      name: /ellipsis icon/i,
    })
      .findByText(linkSelector)
      .click();
  };
  const verifyModel = () => {
    setVerification(/Verify this model/);
    cy.wait("@updateVerification");
  };
  const unverifyModel = () => {
    setVerification(/Remove verification/);
    cy.wait("@updateVerification");
  };

  const toggleVerificationFilter = () => {
    openFilterPopover();
    toggle().next("label").click();
    cy.wait("@updateFilter");
  };

  const browseModels = () => {
    cy.visit("/");

    navigationSidebar()
      .findByRole("listitem", { name: "Browse models" })
      .click();
  };

  it("/browse/models allows models to be filtered, on an enterprise instance", () => {
    cy.log('Create a "Products" model');
    cy.createQuestion({
      name: "Products Model",
      query: {
        "source-table": PRODUCTS_ID,
        limit: 10,
      },
      type: "model",
    });

    browseModels();

    cy.log("Cells for the Products and Orders models exist in the table");
    productsModel().should("exist");
    ordersModel().should("exist");

    cy.log(
      "In the Browse models table, the Products Model is marked as unverified",
    );
    productsModelRow().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });
    cy.log(
      "In the Browse models table, the Orders Model is marked as unverified",
    );
    ordersModelRow().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });

    cy.log("There are no verified models, so the filter toggle is not visible");
    filterButton().should("not.exist");

    cy.log("Verify the Orders Model");
    verifyModel();

    browseModels();

    cy.log("Filter on verified models is enabled by default");
    cy.findByTestId("browse-models-header")
      .findByTestId("filter-dot")
      .should("be.visible");

    cy.log(
      "The Products Model does not appear in the table, since it's not verified",
    );
    productsModel().should("not.exist");

    cy.log("The Orders Model appears in the table");
    ordersModel().should("exist");

    cy.log("The Orders Model now appears in the table as verified");
    ordersModelRow().within(() => {
      cy.icon("model").should("not.exist");
      cy.icon("model_with_badge").should("exist");
    });

    cy.log("The filter toggle is now visible");
    filterButton().should("be.visible");

    cy.log("Unverify the orders model");
    cy.findByRole("heading", { name: "Orders Model" }).click();
    unverifyModel();

    browseModels();

    cy.log("Visit the products model");
    cy.findByRole("heading", { name: "Products Model" }).click();

    browseModels();

    cy.log("The filter toggle is not visible");
    filterButton().should("not.exist");

    cy.log(
      "The verified filter, though still active, is not applied if there are no verified models",
    );
    cy.log("Both models are in the table - no filter is applied here");
    ordersModel().should("exist");
    productsModel().should("exist");
    cy.log("Both models are in the recents grid - no filter is applied here");
    recentOrdersModel().should("exist");
    recentProductsModel().should("exist");

    cy.log("Verify the Orders Model");
    modelsTable().findByText("Orders Model").click();
    verifyModel();

    browseModels();

    cy.log("There are no icons in the table representing unverified models");
    modelsTable().icon("model").should("not.exist");

    cy.log("Show all models");
    toggleVerificationFilter();

    cy.log("The Products and Orders models now both exist in the table");
    productsModel().should("exist");
    ordersModel().should("exist");

    cy.log("The Products Model appears as unverified");
    productsModelRow().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });
  });
});

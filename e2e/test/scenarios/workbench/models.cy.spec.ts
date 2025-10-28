const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > workbench > models", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("correctly displays models empty states", () => {
    cy.request("PUT", `/api/card/${ORDERS_MODEL_ID}`, {
      archived: true,
    });

    cy.visit("/bench/model");
    H.benchSidebar().findByText("No models found").should("be.visible");
  });

  it("can browse to a model in a new tab by meta-clicking", () => {
    cy.visit("/bench/model");
    const macOSX = Cypress.platform === "darwin";
    H.setBenchListSorting("Alphabetical");

    H.benchSidebar()
      .findByText("Orders Model")
      .should("be.visible")
      .closest("a")
      .and("have.attr", "href")
      .and("match", /^\/bench\/model\/\d+$/);

    H.benchSidebar().findByText("Orders Model").click({
      metaKey: macOSX,
      ctrlKey: !macOSX,
    });

    cy.location("pathname").should("eq", "/bench/model");
  });
});

// FIXME: Snowplow tracking is currently not implemented for bench
H.describeWithSnowplow.skip("scenarios > workbench > models", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("can browse to a model", () => {
    cy.visit("/bench/overview");
    H.benchNavMenuButton().click();
    H.benchNavItem("Models").click();
    cy.location("pathname").should("eq", "/bench/model");
    H.benchSidebar().findByText("Orders Model").click();
    cy.url().should("match", /^.*\/bench\/model\/\d+$/);
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "browse_data_model_clicked",
      model_id: ORDERS_MODEL_ID,
    });
  });

  it("tracks when a new model creation is initiated", () => {
    cy.visit("/bench/model");
    cy.findByLabelText("Create a new model").should("be.visible").click();
    // eslint-disable-next-line no-unscoped-text-selectors
    cy.findByText("Query builder").should("be.visible").click();
    cy.location("pathname").should("match", /^\/model\/new/);
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "plus_button_clicked",
      triggered_from: "model",
    });
  });

  // FIXME: We don't show any error messages in the new UX which is needs to be fixed UXW-2156
  it("The models page shows an error message if the search endpoint throws an error", () => {
    cy.intercept("GET", "/api/search*", (req) => {
      req.reply({ statusCode: 400 });
    });
    cy.visit("/bench/model");
    H.benchSidebar().findByText("An error occurred").should("be.visible");
  });
});

H.describeWithSnowplowEE("scenarios > workbench > models (EE)", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.activateToken("pro-self-hosted");
    cy.intercept("PUT", "/api/setting/browse-filter-only-verified-models").as(
      "updateFilter",
    );
    cy.intercept("POST", "/api/moderation-review").as("updateVerification");
  });

  const setVerification = (linkSelector: RegExp | string) => {
    cy.findByLabelText("Move, trash, and more…").click();
    cy.findByRole("menu").findByText(linkSelector).click();
  };
  const verifyModel = () => {
    setVerification(/Verify this model/);
    cy.wait("@updateVerification");
  };
  const unverifyModel = () => {
    setVerification(/Remove verification/);
    cy.wait("@updateVerification");
  };

  // FIXME: Does not exist in the new UX, implement or remove this test
  it.skip("/bench/model allows models to be filtered, on an enterprise instance", () => {
    cy.log(
      "Create several models - enough that we can see recently viewed models",
    );
    Array.from({ length: 10 }).forEach((_, i) => {
      H.createQuestion({
        name: `Model ${i}`,
        query: {
          "source-table": PRODUCTS_ID,
          limit: 10,
        },
        type: "model",
      });
    });

    cy.visit("/bench/model");

    cy.log("Models exist in the sidebar");
    H.benchSidebar().findByText("Model 1").should("exist");
    H.benchSidebar().findByText("Model 2").should("exist");

    cy.log("Verify Model 2");
    H.benchSidebar().findByText("Model 2").click();
    verifyModel();

    cy.visit("/bench/model");

    cy.log("Filter on verified models is enabled by default");
    cy.findByTestId("bench-list-settings-button").should("be.visible");

    cy.log("Model 1 does not appear in the sidebar, since it's not verified");
    H.benchSidebar().findByText("Model 1").should("not.exist");

    cy.log("Model 2 now appears in the sidebar as verified");
    H.benchSidebar().findByText("Model 2").should("exist");

    cy.log("The filter toggle is now visible");
    cy.findByTestId("bench-list-settings-button").should("be.visible");

    cy.log("Unverify Model 2");
    H.benchSidebar().findByText("Model 2").click();
    unverifyModel();

    cy.visit("/bench/model");

    cy.log("Visit Model 1");
    H.benchSidebar().findByText("Model 1").click();

    cy.log("make sure data is loaded");
    H.tableInteractive().findByText("Rustic Paper Wallet").should("be.visible");

    cy.visit("/bench/model");

    cy.log("The filter toggle is not visible");
    cy.findByTestId("bench-list-settings-button").should("not.exist");

    cy.log(
      "The verified filter, though still active, is not applied if there are no verified models",
    );
    cy.log("Both models are in the sidebar - no filter is applied here");
    H.benchSidebar().findByText("Model 2").should("exist");
    H.benchSidebar().findByText("Model 1").should("exist");

    cy.log("Verify Model 2");
    H.benchSidebar().findByText("Model 2").click();
    verifyModel();

    cy.visit("/bench/model");

    cy.log("Show all models");
    cy.findByTestId("bench-list-settings-button").click();
    H.popover().findByText("Show all").click();

    cy.log("Both models now both exist in the sidebar");
    H.benchSidebar().findByText("Model 1").should("exist");
    H.benchSidebar().findByText("Model 2").should("exist");
  });
});

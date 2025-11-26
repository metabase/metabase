const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

const verifiedFilterToggleButton = () =>
  cy
    .findByTestId("browse-models-header")
    .findByRole("switch", { name: /show.*verified.*models/i });

describe("browse > models", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("correctly displays models empty states", () => {
    cy.log(
      "Models explanation banner is visible initially but can be dismissed",
    );
    cy.visit("/browse/models");
    cy.findAllByRole("complementary")
      .filter(
        ":contains(Create models to clean up and combine tables to make your data easier to explore)",
      )
      .as("banner");
    cy.get("@banner").should("be.visible");
    cy.findByRole("button", { name: "Dismiss" }).click();
    cy.get("@banner").should("not.exist");

    cy.log("Removing the last model from the page displays an empty state");
    cy.findAllByTestId("model-name").should("have.length", 1); // sanity check
    cy.request("PUT", `/api/card/${ORDERS_MODEL_ID}`, {
      archived: true,
    });
    cy.reload();
    cy.get("iframe").as("YouTubeVideo").should("be.visible");
    cy.get("@banner").should("not.exist");
    cy.findByRole("heading", {
      name: "Create models to clean up and combine tables to make your data easier to explore",
    }).should("be.visible");
  });

  it("can browse to a model in a new tab by meta-clicking", () => {
    cy.on("window:before:load", (win) => {
      // prevent Cypress opening in a new window/tab and spy on this method
      cy.stub(win, "open").as("open");
    });
    cy.visit("/browse/models");
    const macOSX = Cypress.platform === "darwin";
    cy.findByRole("heading", { name: "Orders Model" }).click({
      metaKey: macOSX,
      ctrlKey: !macOSX,
    });

    cy.get("@open").should("have.been.calledOnce");
    cy.get("@open").should(
      "have.been.calledOnceWithExactly",
      `/model/${ORDERS_MODEL_ID}-orders-model`,
      "_blank",
    );
  });
});

describe("scenarios > browse", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  it("can browse to a model", () => {
    cy.visit("/");
    H.navigationSidebar().findByLabelText("Browse models").click();
    cy.location("pathname").should("eq", "/browse/models");
    cy.findByRole("heading", { name: "Orders Model" }).click();
    cy.url().should("include", `/model/${ORDERS_MODEL_ID}-`);
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "browse_data_model_clicked",
      model_id: ORDERS_MODEL_ID,
    });
  });

  it("can browse to a table in a database", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("button", { name: /Summarize/ });
    cy.findByRole("link", { name: /Sample Database/ }).click();
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "browse_data_table_clicked",
      table_id: PRODUCTS_ID,
    });
  });

  it("can generate x-ray dashboard from a browse page", () => {
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

    cy.findByTestId("browse-schemas").within(() => {
      cy.findAllByRole("link")
        .filter(":contains(People)")
        .should("be.visible")
        .realHover();
      cy.findAllByLabelText("X-ray this table").filter(":visible").click();
    });

    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "x-ray_clicked",
      event_detail: "table",
      triggered_from: "browse_database",
    });
  });

  it("tracks when a new model creation is initiated", () => {
    cy.visit("/browse/models");
    cy.findByTestId("browse-models-header")
      .findByLabelText("Create a new model")
      .should("be.visible")
      .click();
    cy.location("pathname").should("eq", "/model/new");
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "plus_button_clicked",
      triggered_from: "model",
    });
  });

  it("tracks when a new metric creation is initiated", () => {
    cy.visit("/browse/metrics");
    cy.findByTestId("browse-metrics-header")
      .findByLabelText("Create a new metric")
      .should("be.visible")
      .click();
    H.miniPicker().should("be.visible");

    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "plus_button_clicked",
      triggered_from: "metric",
    });
  });

  it("browsing to a database only triggers a request for schemas for that specific database", () => {
    cy.intercept("GET", `/api/database/${SAMPLE_DB_ID}/schemas`).as(
      "schemasForSampleDatabase",
    );
    cy.intercept(
      "GET",
      /\/api\/database\/(?!1\b)\d+\/schemas/,
      cy.spy().as("schemasForOtherDatabases"),
    );
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Sample Database/ }).click();
    cy.wait("@schemasForSampleDatabase");
    cy.get("@schemasForOtherDatabases").should("not.have.been.called");
  });

  it("can visit 'Learn about our data' page", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.location("pathname").should("eq", "/reference/databases");
    H.expectNoBadSnowplowEvents();
    H.expectUnstructuredSnowplowEvent({
      event: "learn_about_our_data_clicked",
    });
    cy.go("back");
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();
    cy.findByRole("gridcell", { name: "Rustic Paper Wallet" });
  });

  it("on an open-source instance, the Browse models page has no controls for setting filters", () => {
    cy.visit("/");
    H.navigationSidebar().findByLabelText("Browse models").click();
    verifiedFilterToggleButton().should("not.exist");
  });

  it("The Browse models page shows an error message if the search endpoint throws an error", () => {
    cy.visit("/");
    cy.intercept("GET", "/api/search*", (req) => {
      req.reply({ statusCode: 400 });
    });
    H.navigationSidebar().findByLabelText("Browse models").click();
    cy.findByLabelText("Models")
      .findAllByText("An error occurred")
      .should("have.length", 2);
  });

  it("The Browse metrics page shows an error message if the search endpoint throws an error", () => {
    cy.visit("/");
    cy.intercept("GET", "/api/search*", (req) => {
      req.reply({ statusCode: 400 });
    });
    H.navigationSidebar().findByLabelText("Browse metrics").click();
    cy.findByLabelText("Metrics")
      .findByText("An error occurred")
      .should("be.visible");
  });
});

describe("scenarios > browse (EE)", () => {
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

  const recentsGrid = () => cy.findByRole("grid", { name: "Recents" });
  const modelsTable = () => cy.findByRole("table", { name: "Table of models" });
  const model1 = () => modelsTable().findByRole("heading", { name: "Model 1" });
  const recentModel1 = () => recentsGrid().findByText("Model 1");
  const model2 = () => modelsTable().findByRole("heading", { name: "Model 2" });
  const recentModel2 = () => recentsGrid().findByText("Model 2");
  const model1Row = () => modelsTable().findByRole("row", { name: /Model 1/i });
  const model2Row = () => modelsTable().findByRole("row", { name: /Model 2/i });

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

  const toggleVerificationFilter = () => {
    verifiedFilterToggleButton().click();
    cy.wait("@updateFilter");
  };

  const browseModels = () => {
    cy.visit("/");

    H.navigationSidebar()
      .findByRole("listitem", { name: "Browse models" })
      .click();
  };

  it("/browse/models allows models to be filtered, on an enterprise instance", () => {
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

    browseModels();

    cy.log("Cells for both models exist in the table");
    model1().should("exist");
    model2().should("exist");

    cy.log("In the Browse models table, model 1 is marked as unverified");
    model1Row().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });
    cy.log("In the Browse models table, model 2 is marked as unverified");
    model2Row().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });

    cy.log("There are no verified models, so the filter toggle is not visible");
    verifiedFilterToggleButton().should("not.exist");

    cy.log("Verify Model 2");
    cy.findByRole("heading", { name: "Model 2" }).click();
    verifyModel();

    browseModels();

    cy.log("Filter on verified models is enabled by default");
    cy.findByTestId("browse-models-header").findByRole("switch", {
      name: /Show unverified models, too/i,
    });

    cy.log("Model 1 does not appear in the table, since it's not verified");
    model1().should("not.exist");

    cy.log("Model 2 now appears in the table as verified");
    model2().should("exist");
    model2Row().within(() => {
      cy.icon("model").should("not.exist");
      cy.icon("model_with_badge").should("exist");
    });

    cy.log("The filter toggle is now visible");
    verifiedFilterToggleButton().should("be.visible");

    cy.log("Unverify Model 2");
    cy.findByRole("heading", { name: "Model 2" }).click();
    unverifyModel();

    browseModels();

    cy.log("Visit Model 1");
    cy.findByRole("heading", { name: "Model 1" }).click();

    cy.log("make sure data is loaded");
    H.tableInteractive().findByText("Rustic Paper Wallet").should("be.visible");

    browseModels();

    cy.log("The filter toggle is not visible");
    verifiedFilterToggleButton().should("not.exist");

    cy.log(
      "The verified filter, though still active, is not applied if there are no verified models",
    );
    cy.log("Both models are in the table - no filter is applied here");
    model2().should("exist");
    model1().should("exist");
    cy.log("Both models are in the recents grid - no filter is applied here");
    recentModel2().should("exist");
    recentModel1().should("exist");

    cy.log("Verify Model 2");
    modelsTable().findByText("Model 2").click();
    verifyModel();

    browseModels();

    cy.log("There are no icons in the table representing unverified models");
    modelsTable().icon("model").should("not.exist");

    cy.log("Show all models");
    toggleVerificationFilter();

    cy.log("Both models now both exist in the table");
    model1().should("exist");
    model2().should("exist");

    cy.log("Model 1 appears as unverified");
    model1Row().within(() => {
      cy.icon("model").should("exist");
      cy.icon("model_with_badge").should("not.exist");
    });
  });
});

describe("issue 37907", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.intercept("PUT", "/api/field/*").as("fieldUpdate");
  });

  it("allows to change field descriptions in data reference page (metabase#37907)", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("link", { name: /Learn about our data/ }).click();
    cy.findByTestId("data-reference-list-item").click();
    cy.findByRole("link", { name: /Tables in Sample Database/ }).click();
    cy.findAllByTestId("data-reference-list-item").findByText("Orders").click();
    cy.findByRole("link", { name: /Fields in this table/ }).click();
    cy.button(/Edit/).realClick(); // click() does not work
    cy.findAllByPlaceholderText("No column description yet")
      .eq(0)
      .clear()
      .type("My ID column");
    cy.findAllByPlaceholderText("No column description yet")
      .eq(5)
      .focus()
      .type(" Updated.");
    cy.button(/Save/).realClick(); // click() does not work
    cy.wait(["@fieldUpdate", "@fieldUpdate"]);

    cy.get("main").within(() => {
      cy.findByText("My ID column").should("be.visible");
      cy.findByText("The total billed amount. Updated.").should("be.visible");
      cy.findByText("Discount amount.").scrollIntoView().should("be.visible");
    });

    H.visitQuestion(ORDERS_QUESTION_ID);

    H.tableInteractive().findByTextEnsureVisible("ID").realHover();
    H.popover().should("include.text", "My ID column");

    H.tableInteractive().findByTextEnsureVisible("Total").realHover();
    H.popover().should("include.text", "The total billed amount. Updated.");

    H.tableInteractive().findByTextEnsureVisible("Discount ($)").realHover();
    H.popover().should("include.text", "Discount amount.");
  });
});

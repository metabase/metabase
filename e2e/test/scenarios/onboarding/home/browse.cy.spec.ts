const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_MODEL_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID, ORDERS_ID } = SAMPLE_DATABASE;

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

  it("opens a table at a clean /table/:slug URL that falls back to /question on edit", () => {
    cy.visit("/");
    H.browseDatabases().click();
    cy.findByRole("heading", { name: "Sample Database" }).click();
    cy.findByRole("heading", { name: "Products" }).click();

    cy.log("a pristine table view keeps the canonical /table/:slug URL");
    cy.findByRole("button", { name: /Summarize/ }).should("be.visible");
    cy.location("pathname").should("eq", `/table/${PRODUCTS_ID}-products`);

    cy.log("the clean URL survives a reload");
    cy.reload();
    cy.findByRole("button", { name: /Summarize/ }).should("be.visible");
    cy.location("pathname").should("eq", `/table/${PRODUCTS_ID}-products`);

    cy.log("editing the question falls back to the ad-hoc /question#hash form");
    H.tableHeaderClick("Category");
    H.popover()
      .findByTestId("click-actions-sort-control-sort.ascending")
      .click();
    cy.location("pathname").should("eq", "/question");
    cy.location("hash").should("not.be.empty");
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

describe("issue 74433", () => {
  const LONG_TABLE_NAME =
    "thisisaverylongtablenamewithoutspacesthatshouldoverflowthetooltipboxbecausetherearenospacesforbreakingxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    cy.request("PUT", `/api/table/${ORDERS_ID}`, {
      display_name: LONG_TABLE_NAME,
    });
  });

  it("table-name tooltip in Browse Databases should not overflow when the name has no spaces (metabase#74433)", () => {
    cy.visit(`/browse/databases/${SAMPLE_DB_ID}`);

    // Browse cards actually have a <Title> as the child of the <Ellipsified> component,
    // so we need to target the parent for the hover
    cy.findByRole("heading", { name: LONG_TABLE_NAME }).parent().realHover();

    H.tooltip()
      .should("be.visible")
      .and(($tooltip) => {
        const tooltip = $tooltip[0];
        expect(
          tooltip.scrollWidth,
          "tooltip content fits within its box",
        ).to.be.lte(tooltip.clientWidth);
      });
  });
});

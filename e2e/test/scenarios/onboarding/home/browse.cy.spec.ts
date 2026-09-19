const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID } = SAMPLE_DATABASE;

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
    cy.findByRole("heading", { name: "Orders Model" }).click(H.holdMetaKey);

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

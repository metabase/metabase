import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  navigateToEntitySelectionStep,
} from "./helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

const suiteTitle =
  "scenarios > embedding > sdk iframe embed setup > embed parameters";

H.describeWithSnowplow(suiteTitle, () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("dashboards with parameters", () => {
    beforeEach(() => {
      H.createQuestionAndDashboard({
        questionDetails: {
          name: "Orders table",
          query: { "source-table": ORDERS_ID },
        },
        dashboardDetails: {
          name: "Dashboard with Parameters",
          parameters: DASHBOARD_PARAMETERS,
        },
      }).then(({ body: card }) => {
        H.editDashboardCard(card, {
          parameter_mappings: DASHBOARD_PARAMETERS.map((parameter) => ({
            card_id: card.card_id,
            parameter_id: parameter.id,
            target: ["dimension", ["field", ORDERS.ID, null]],
          })),
        });
      });
    });

    it("loads parameters into parameter settings", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
      });

      getEmbedSidebar().within(() => {
        cy.findByText("Parameters").should("be.visible");

        cy.log("parameter inputs should be visible");
        cy.findByLabelText("ID").should("be.visible");
        cy.findByLabelText("Product ID").should("be.visible");

        cy.log("parameters should be visible by default");

        parameterVisibilityToggle("id").should(
          "have.attr",
          "data-hidden",
          "false",
        );

        parameterVisibilityToggle("product_id").should(
          "have.attr",
          "data-hidden",
          "false",
        );
      });
    });

    it("can set default parameter values", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
      });

      cy.log("set default value for id");
      getEmbedSidebar().findByLabelText("ID").type("123").blur();

      H.getIframeBody()
        .findByTestId("dashboard-parameters-widget-container")
        .findByLabelText("ID")
        .should("contain", "123");

      cy.log("set default value for product id");
      getEmbedSidebar().findByLabelText("Product ID").type("456").blur();

      H.getIframeBody()
        .findByTestId("dashboard-parameters-widget-container")
        .findByLabelText("Product ID")
        .should("contain", "456");

      H.expectUnstructuredSnowplowEvent(
        {
          event: "embed_wizard_option_changed",
          event_detail: "initialParameters",
        },
        2,
      );

      cy.log("both default values should be in the code snippet");
      getEmbedSidebar().within(() => {
        cy.findByText("Get Code").click();
        codeBlock().should("contain", "initial-parameters=");
        codeBlock().should("contain", '"id":"123"');
        codeBlock().should("contain", '"product_id":"456"');
      });
    });

    it("can hide dashboard parameters", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: "Dashboard with Parameters",
      });

      cy.log("hide both parameters");
      getEmbedSidebar().within(() => {
        parameterVisibilityToggle("id").click();
        parameterVisibilityToggle("product_id").click();
      });

      cy.log("parameter widget container should not exist");
      H.getIframeBody()
        .findByTestId("dashboard-parameters-widget-container")
        .should("not.exist");

      H.expectUnstructuredSnowplowEvent(
        {
          event: "embed_wizard_option_changed",
          event_detail: "hiddenParameters",
        },
        2,
      );

      cy.log("code snippet should contain the hidden parameters");
      getEmbedSidebar().within(() => {
        cy.findByText("Get Code").click();
        codeBlock().should("contain", "hidden-parameters=");
        codeBlock().should("contain", '"id"');
        codeBlock().should("contain", '"product_id"');
      });
    });
  });

  describe("questions with parameters", () => {
    beforeEach(() => {
      H.createNativeQuestion({
        name: "Question with Parameters",
        native: {
          query: "SELECT * FROM orders WHERE id = {{id}}",
          "template-tags": {
            id: {
              id: "11111111",
              name: "id",
              "display-name": "ID",
              type: "number",
              default: null,
            },
          },
        },
      });
    });

    it("can set default parameters for SQL questions", () => {
      navigateToEmbedOptionsStep({
        experience: "chart",
        resourceName: "Question with Parameters",
      });

      getEmbedSidebar().within(() => {
        cy.findByText("Parameters").should("be.visible");
        cy.findByLabelText("ID").should("be.visible");
      });

      H.getIframeBody()
        .findByText(/missing required parameters/)
        .should("exist");

      getEmbedSidebar().within(() => {
        cy.findByLabelText("ID").type("123").blur();
      });

      H.getIframeBody().within(() => {
        cy.findByText(/missing required parameters/).should("not.exist");
        cy.findByText("123").should("be.visible");

        // value in a subtotal field
        cy.findAllByText("75.41").first().should("be.visible");
      });

      H.expectUnstructuredSnowplowEvent({
        event: "embed_wizard_option_changed",
        event_detail: "initialSqlParameters",
      });

      getEmbedSidebar().within(() => {
        cy.findByText("Get Code").click();
        codeBlock().should("contain", "initial-sql-parameters=");
        codeBlock().should("not.contain", "hidden-parameters="); // not supported for questions yet
        codeBlock().should("contain", '"id":"123"');
      });
    });
  });

  describe("resources without parameters", () => {
    it("shows no parameters message for dashboards without parameters", () => {
      navigateToEmbedOptionsStep({
        experience: "dashboard",
        resourceName: "Orders in a dashboard",
      });

      getEmbedSidebar().within(() => {
        cy.findByText(
          "Parameters are not available for this dashboard.",
        ).should("be.visible");
      });
    });

    it("shows no parameters message for questions without parameters", () => {
      navigateToEmbedOptionsStep({
        experience: "chart",
        resourceName: "Orders, Count",
      });

      getEmbedSidebar().within(() => {
        cy.findByText("Parameters are not available for this chart.").should(
          "be.visible",
        );
      });
    });

    it("should not show parameter settings for exploration template", () => {
      navigateToEntitySelectionStep({ experience: "exploration" });

      getEmbedSidebar().within(() => {
        cy.log("go to embed options step");
        cy.findByText("Next").click();

        cy.log("should still contain appearance and behavior");
        cy.findByText("Appearance").should("be.visible");
        cy.findByText("Behavior").should("be.visible");

        cy.log("should not contain parameters");
        cy.findByText("Parameters").should("not.exist");
      });
    });
  });
});

const parameterVisibilityToggle = (slug: string) =>
  cy
    .findAllByTestId("parameter-visibility-toggle")
    .get(`[data-parameter-slug="${slug}"]`);

const DASHBOARD_PARAMETERS = [
  {
    name: "ID",
    slug: "id",
    id: "11111111",
    type: "id",
  },
  {
    name: "Product ID",
    slug: "product_id",
    id: "22222222",
    type: "id",
  },
];

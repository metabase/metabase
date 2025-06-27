import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > embed parameters", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("GET", "/api/card/**").as("card");

    // Create shared dashboard with parameters
    const dashboardParameters = [
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

    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders table",
        query: { "source-table": ORDERS_ID },
      },
      dashboardDetails: {
        name: "Dashboard with Parameters",
        parameters: dashboardParameters,
      },
    }).then(({ body: card }) => {
      H.editDashboardCard(card, {
        parameter_mappings: dashboardParameters.map((parameter) => ({
          card_id: card.card_id,
          parameter_id: parameter.id,
          target: ["dimension", ["field", ORDERS.ID, null]],
        })),
      });
    });

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

  it("loads parameters into parameter settings", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: "Dashboard with Parameters",
    });

    // Should be on the options step with parameter settings
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

    cy.log("set default values for parameters");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("ID").type("123").blur();
      cy.findByLabelText("Product ID").type("456").blur();
    });

    cy.log("default values should show up in the parameter widget");
    H.getIframeBody().within(() => {
      parameterWidgetContainer().within(() => {
        cy.findByLabelText("ID").should("contain", "123");
        cy.findByLabelText("Product ID").should("contain", "456");
      });
    });

    cy.log("default values should be in the code snippet");
    getEmbedSidebar().within(() => {
      cy.findByText("Get Code").click();
      codeBlock().should("contain", '"initialParameters"');
      codeBlock().should("contain", '"id": "123"');
      codeBlock().should("contain", '"product_id": "456"');
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
    H.getIframeBody().within(() => {
      parameterWidgetContainer().should("not.exist");
    });

    cy.log("code snippet should contain the hidden parameters");
    getEmbedSidebar().within(() => {
      cy.findByText("Get Code").click();
      codeBlock().should("contain", '"hiddenParameters"');
      codeBlock().should("contain", '"id"');
      codeBlock().should("contain", '"product_id"');
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

    getEmbedSidebar().within(() => {
      cy.findByText("Get Code").click();
      codeBlock().should("contain", '"initialSqlParameters"');
      codeBlock().should("contain", '"id": "123"');
    });
  });

  it("shows no parameters message for dashboards without parameters", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: "Orders in a dashboard",
    });

    getEmbedSidebar().within(() => {
      cy.findByText("Parameters are not available for this dashboard.").should(
        "be.visible",
      );
    });
  });

  it("shows no parameters message for charts without parameters", () => {
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

const navigateToEmbedOptionsStep = ({
  experience,
  resourceName,
}: {
  experience: "dashboard" | "chart" | "exploration";
  resourceName?: string;
}) => {
  navigateToEntitySelectionStep({ experience, resourceName });

  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Embed options step
  });
};

const parameterVisibilityToggle = (slug: string) =>
  cy
    .findAllByTestId("parameter-visibility-toggle")
    .get(`[data-parameter-slug="${slug}"]`);

const codeBlock = () => cy.get(".cm-content");

const parameterWidgetContainer = () =>
  cy.findByTestId("dashboard-parameters-widget-container");

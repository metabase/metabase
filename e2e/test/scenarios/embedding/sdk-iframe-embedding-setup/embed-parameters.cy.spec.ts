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

      getParameterVisibilityToggle("ID").should(
        "have.attr",
        "data-hidden",
        "false",
      );

      getParameterVisibilityToggle("Product ID").should(
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

    cy.log("verify the default values appear in the preview");
    H.getIframeBody().within(() => {
      cy.get('[aria-label="ID"]').should("contain", "123");
      cy.get('[aria-label="Product ID"]').should("contain", "456");
    });

    cy.log("default values should be in the code snippet");
    getEmbedSidebar().within(() => {
      cy.findByText("Get Code").click();
      codeBlock().should("contain", '"initialParameters"');
      codeBlock().should("contain", '"id": "123"');
      codeBlock().should("contain", '"product_id": "456"');
    });
  });

  it("should allow hiding dashboard parameters", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: "Dashboard with Parameters",
    });

    getEmbedSidebar().within(() => {
      // Hide the ID parameter
      getParameterVisibilityToggle("ID").click();

      // Navigate to the code step to verify the setting is included
      cy.findByText("Next").click();
    });

    // The code snippet should include the hidden parameter
    getEmbedSidebar().within(() => {
      cy.findByText("hiddenParameters").should("be.visible");
      cy.findByText('"id"').should("be.visible");
    });
  });

  it("should show parameter settings for questions with SQL parameters", () => {
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: "Question with Parameters",
    });

    // Should show parameter settings
    getEmbedSidebar().within(() => {
      cy.findByText("Parameters").should("be.visible");
      cy.findByText("Set default values and control visibility").should(
        "be.visible",
      );

      // Should show parameter input
      cy.findByLabelText("ID").should("be.visible");

      // Questions should not have visibility toggles
      cy.findByLabelText("ID")
        .parent()
        .within(() => {
          cy.get("[data-testid='parameter-visibility-toggle']").should(
            "not.exist",
          );
        });
    });
  });

  it("should show no parameters message for entities without parameters", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    // Should show no parameters message for the default dashboard (Orders in a dashboard)
    getEmbedSidebar().within(() => {
      cy.findByText("Parameters are not available for this dashboard.").should(
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

const getParameterVisibilityToggle = (parameterName: string) =>
  cy
    .findByLabelText(parameterName)
    .parent()
    .get("[data-testid='parameter-visibility-toggle']");

const codeBlock = () => cy.get(".cm-content");

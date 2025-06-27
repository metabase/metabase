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
        sectionId: "id",
      },
      {
        name: "Product ID",
        slug: "product_id",
        id: "22222222",
        type: "id",
        sectionId: "id",
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

  it("should allow setting default parameter values", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      // Set a default value for the ID parameter
      cy.findByLabelText("ID").type("123");

      // The value should be set in the parameter input
      cy.findByLabelText("ID").should("have.value", "123");

      // Navigate to the code step to verify the setting is included
      cy.findByText("Next").click();
    });

    // The code snippet should include the initial parameter
    getEmbedSidebar().within(() => {
      cy.findByText("initialParameters").should("be.visible");
      cy.findByText('"id": "123"').should("be.visible");
    });
  });

  it("should allow hiding dashboard parameters", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    getEmbedSidebar().within(() => {
      // Hide the ID parameter
      cy.findByLabelText("ID")
        .parent()
        .within(() => {
          cy.get("[data-testid='parameter-visibility-toggle']").click();
        });

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
    navigateToEmbedOptionsStep({ experience: "chart" });

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
      cy.findByText("Next").click(); // Should go directly to options step (no entity selection)
    });

    // Should not show parameter settings for exploration
    getEmbedSidebar().within(() => {
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

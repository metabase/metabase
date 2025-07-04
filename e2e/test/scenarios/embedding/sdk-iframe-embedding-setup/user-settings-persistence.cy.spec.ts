import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import { getEmbedSidebar, navigateToEntitySelectionStep } from "./helpers";

const { H } = cy;

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");

    cy.intercept("GET", "/api/dashboard/**").as("dashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
  });

  it("persists dashboard embed options", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. set embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").click().should("be.checked");

      capturePersistSettings();

      cy.findByLabelText("Show dashboard title")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Dashboard").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. persisted settings should be restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show dashboard title").should("not.be.checked");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });
  });

  it("persists chart embed options", () => {
    navigateToEmbedOptionsStep({ experience: "chart" });

    cy.log("1. set chart embed settings to non-default values");
    getEmbedSidebar().within(() => {
      capturePersistSettings();
      cy.findByLabelText("Allow downloads").click().should("be.checked");
      cy.wait("@persistSettings");

      capturePersistSettings();
      cy.findByLabelText("Show chart title").click().should("not.be.checked");
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Chart").should("be.checked");
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. verify persisted settings are restored");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads").should("be.checked");
      cy.findByLabelText("Show chart title").should("not.be.checked");
      cy.findByLabelText("Allow users to drill through on data points").should(
        "be.checked",
      );
    });
  });

  it("persists exploration embed options", () => {
    navigateToEmbedOptionsStep({ experience: "exploration" });

    cy.log("1. set exploration settings to non-default values");
    capturePersistSettings();
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions")
        .click()
        .should("not.be.checked");
    });

    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("2. reload the page");
    waitAndReload();

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Exploration").should("be.checked");
      cy.findByText("Next").click(); // Embed options step

      cy.log("3. persisted settings should be restored");
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });
  });

  it("persists brand colors", () => {
    navigateToEmbedOptionsStep({ experience: "dashboard" });

    cy.log("1. change brand color to red");
    cy.findByLabelText("#509EE3").click();

    H.popover().within(() => {
      capturePersistSettings();

      cy.findByDisplayValue("#509EE3")
        .should("be.visible")
        .clear()
        .type("rgb(255, 0, 0)")
        .blur();
    });

    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");

    cy.log("2. reload the page");
    waitAndReload();

    cy.log("3. brand color should be persisted");
    H.getIframeBody()
      .findAllByTestId("cell-data")
      .first()
      .should("have.css", "color", "rgb(255, 0, 0)");
  });

  it("persists sso auth method", () => {
    enableJwtAuth();
    navigateToGetCodeStep({ experience: "dashboard" });

    cy.log("1. select sso auth method");
    getEmbedSidebar().within(() => {
      capturePersistSettings();

      cy.findByLabelText("Single sign-on (SSO)")
        .should("not.be.disabled")
        .click()
        .should("be.checked");

      codeBlock().should("not.contain", "useExistingUserSession");
    });

    cy.log("2. reload the page");
    waitAndReload();
    navigateToGetCodeStep({ experience: "dashboard" });

    cy.log("3. auth method should persist");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase Session").should("not.be.checked");
      cy.findByLabelText("Single sign-on (SSO)").should("be.checked");
      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });

  it("persists default and hidden parameters", () => {
    H.createQuestionAndDashboard({
      questionDetails: {
        name: "Orders table",
        query: { "source-table": 1 },
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
          target: ["dimension", ["field", 1, null]],
        })),
      });
    });

    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: "Dashboard with Parameters",
    });

    cy.log("1. hide one parameter and set default value for another");
    getEmbedSidebar().within(() => {
      parameterVisibilityToggle("id").click();
      parameterVisibilityToggle("id").should(
        "have.attr",
        "data-hidden",
        "true",
      );

      capturePersistSettings();

      cy.findByLabelText("Product ID").type("456").blur();
    });

    H.getIframeBody().within(() => {
      cy.findByTestId("dashboard-parameters-widget-container").within(() => {
        cy.findByLabelText("ID").should("not.exist");
        cy.findByLabelText("Product ID").should("contain", "456");
      });
    });

    cy.log("2. reload the page");
    waitAndReload();
    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
      cy.findByText("Next").click(); // Embed options step
    });

    cy.log("3. parameter settings should be persisted");
    getEmbedSidebar().within(() => {
      parameterVisibilityToggle("id").should(
        "have.attr",
        "data-hidden",
        "true",
      );

      cy.findByLabelText("Product ID").should("have.value", "456");
    });

    H.getIframeBody().within(() => {
      cy.findByTestId("dashboard-parameters-widget-container").within(() => {
        cy.findByLabelText("ID").should("not.exist");
        cy.findByLabelText("Product ID").should("contain", "456");
      });
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

const navigateToGetCodeStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  navigateToEmbedOptionsStep({ experience });

  getEmbedSidebar().within(() => {
    cy.findByText("Get Code").click();
  });
};

const codeBlock = () => cy.get(".cm-content");

// We must capture at the last embed options to change,
// otherwise we'd miss the last PUT request.
const capturePersistSettings = () => {
  cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
    "persistSettings",
  );
};

const waitAndReload = () => {
  cy.wait("@persistSettings").then(() => {
    // Reduce flakiness by waiting for settings to be saved.
    cy.wait(1000);

    cy.reload();

    cy.get("#iframe-embed-container").should(
      "have.attr",
      "data-iframe-loaded",
      "true",
    );
  });
};

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

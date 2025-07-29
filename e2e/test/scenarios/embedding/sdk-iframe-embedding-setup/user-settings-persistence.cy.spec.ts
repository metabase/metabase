import { enableJwtAuth } from "e2e/support/helpers/e2e-jwt-helpers";

import {
  codeBlock,
  getEmbedSidebar,
  navigateToEmbedOptionsStep,
  navigateToGetCodeStep,
} from "./helpers";

const { H } = cy;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";

describe("scenarios > embedding > sdk iframe embed setup > user settings persistence", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.updateSetting("enable-embedding-simple", true);

    cy.intercept("PUT", "/api/setting/sdk-iframe-embed-setup-settings").as(
      "persistSettings",
    );
  });

  it("persists dashboard embed options", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("1. set embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads")
        .should("not.be.checked")
        .click()
        .should("be.checked");

      cy.findByLabelText("Show dashboard title")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. reload the page");
    waitAndReload();
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      skipResourceSelection: true,
      dismissEmbedTerms: false,
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
    navigateToEmbedOptionsStep({
      experience: "chart",
      resourceName: QUESTION_NAME,
    });

    cy.wait("@persistSettings");

    cy.log("1. set chart embed settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow downloads")
        .should("not.be.checked")
        .click()
        .should("be.checked");

      cy.findByLabelText("Show chart title")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    cy.log("2. reload the page");

    waitAndReload();
    navigateToEmbedOptionsStep({
      experience: "chart",
      skipResourceSelection: true,
      dismissEmbedTerms: false,
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
    cy.wait("@persistSettings");

    cy.log("1. set exploration settings to non-default values");
    getEmbedSidebar().within(() => {
      cy.findByLabelText("Allow users to save new questions")
        .should("be.checked")
        .click()
        .should("not.be.checked");
    });

    H.getIframeBody().findByText("Save").should("not.exist");

    cy.log("2. reload the page");
    waitAndReload();
    navigateToEmbedOptionsStep({
      experience: "exploration",
      dismissEmbedTerms: false,
    });

    getEmbedSidebar().within(() => {
      cy.log("3. persisted settings should be restored");
      cy.findByLabelText("Allow users to save new questions").should(
        "not.be.checked",
      );
    });
  });

  it("persists brand colors", () => {
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("1. change brand color to red");
    cy.findByLabelText("#509EE3").click();

    H.popover().within(() => {
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
    navigateToGetCodeStep({
      experience: "dashboard",
      resourceName: DASHBOARD_NAME,
    });

    cy.log("1. select sso auth method");
    getEmbedSidebar().within(() => {
      cy.log("single sign on should not be checked by default");
      cy.findByLabelText("Single sign-on (SSO)")
        .should("not.be.checked")
        .click()
        .should("be.checked");

      codeBlock().should("not.contain", "useExistingUserSession");
    });

    cy.log("2. reload the page");
    waitAndReload();

    cy.log("3. auth method should persist");
    navigateToGetCodeStep({
      experience: "dashboard",
      skipResourceSelection: true,
      dismissEmbedTerms: false,
    });

    getEmbedSidebar().within(() => {
      cy.findByLabelText("Existing Metabase Session").should("not.be.checked");
      cy.findByLabelText("Single sign-on (SSO)").should("be.checked");
      codeBlock().should("not.contain", "useExistingUserSession");
    });
  });

  it("persists default and hidden parameters", { tags: "@flaky" }, () => {
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

    cy.wait("@persistSettings");

    cy.log("1. hide one parameter and set default value for another");
    getEmbedSidebar().within(() => {
      parameterVisibilityToggle("id")
        .click()
        .should("have.attr", "data-hidden", "true");

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
    navigateToEmbedOptionsStep({
      experience: "dashboard",
      skipResourceSelection: true,
      dismissEmbedTerms: false,
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

const waitAndReload = () => {
  cy.wait("@persistSettings");

  cy.reload();

  cy.get("#iframe-embed-container").should(
    "have.attr",
    "data-iframe-loaded",
    "true",
  );
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

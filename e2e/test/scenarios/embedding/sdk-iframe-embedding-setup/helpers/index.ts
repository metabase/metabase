import { match } from "ts-pattern";

import { entityPickerModal } from "e2e/support/helpers";
import type { Dashboard, RecentItem } from "metabase-types/api";

type RecentActivityIntercept = {
  response: Cypress.Response<{ recents: RecentItem[] }>;
};

type DashboardIntercept = {
  response: Cypress.Response<Dashboard>;
};

export const getEmbedSidebar = () => cy.findByRole("complementary");

export const getRecentItemCards = () =>
  cy.findAllByTestId("embed-recent-item-card");

export const visitNewEmbedPage = ({ locale }: { locale?: string } = {}) => {
  cy.intercept("GET", "/api/dashboard/*").as("dashboard");

  const params = new URLSearchParams();

  if (locale) {
    params.append("locale", locale);
  }

  cy.visit("/embed-js?" + params);

  cy.wait("@dashboard");

  cy.get("[data-iframe-loaded]", { timeout: 20000 }).should("have.length", 1);
};

export const assertRecentItemName = (
  model: "dashboard" | "card",
  resourceName: string,
) => {
  cy.get<RecentActivityIntercept>("@recentActivity").should((intercept) => {
    const recentItem = intercept.response?.body.recents?.filter(
      (recent) => recent.model === model,
    )?.[0];

    expect(recentItem.name).to.be.equal(resourceName);
  });
};

export const assertDashboard = ({ id, name }: { id: number; name: string }) => {
  cy.get<DashboardIntercept>("@dashboard").should((intercept) => {
    expect(intercept.response?.body.id).to.be.equal(id);
    expect(intercept.response?.body.name).to.be.equal(name);
  });
};

type NavigateToStepOptions =
  | {
      experience: "exploration";
      resourceName?: never;
    }
  | {
      experience: "dashboard" | "chart" | "browser";
      resourceName: string;
    };

export const navigateToEntitySelectionStep = (
  options: NavigateToStepOptions,
) => {
  const { experience } = options;

  visitNewEmbedPage();

  cy.log("select an experience");

  if (experience === "chart") {
    cy.findByText("Chart").click();
  } else if (experience === "exploration") {
    cy.findByText("Exploration").click();
  } else if (experience === "browser") {
    cy.findByText("Browser").click();
  }

  // exploration template does not have the entity selection step
  if (experience !== "exploration") {
    cy.log("navigate to the entity selection step");
    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
    });
  }

  if (experience !== "exploration") {
    const { resourceName } = options;

    const resourceType = match(experience)
      .with("dashboard", () => "Dashboards")
      .with("chart", () => "Questions")
      .with("browser", () => "Collections")
      .otherwise(() => "");

    cy.log(`searching for ${resourceType} via the picker modal`);
    getEmbedSidebar().within(() => {
      cy.findByTestId("embed-browse-entity-button").click();
    });

    entityPickerModal().within(() => {
      cy.findByText(resourceType).click();
      cy.findAllByText(resourceName).first().click();

      // Collection picker requires an explicit confirmation.
      if (experience === "browser") {
        cy.findByText("Select").click();
      }
    });

    cy.log(`${resourceType} title should be visible by default`);
    getEmbedSidebar().within(() => {
      cy.findByText(resourceName).should("be.visible");
    });
  }
};

export const navigateToEmbedOptionsStep = (options: NavigateToStepOptions) => {
  navigateToEntitySelectionStep(options);

  cy.log("navigate to embed options step");
  getEmbedSidebar().within(() => {
    cy.findByText("Next").click(); // Embed options step
  });
};

export const navigateToGetCodeStep = (options: NavigateToStepOptions) => {
  navigateToEmbedOptionsStep(options);

  cy.log("navigate to get code step");
  getEmbedSidebar().within(() => {
    cy.findByText("Get code").click(); // Get code step
  });
};

export const codeBlock = () => cy.get(".cm-content");

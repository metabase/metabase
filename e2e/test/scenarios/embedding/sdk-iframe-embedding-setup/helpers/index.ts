import { match } from "ts-pattern";

import {
  embedModalEnableEmbedding,
  entityPickerModal,
  modal,
} from "e2e/support/helpers";
import type { Dashboard, RecentItem } from "metabase-types/api";

type RecentActivityIntercept = {
  response: Cypress.Response<{ recents: RecentItem[] }>;
};

type DashboardIntercept = {
  response: Cypress.Response<Dashboard>;
};

export const getEmbedSidebar = () =>
  modal()
    .first()
    .within(() => cy.findByRole("complementary"));

export const getRecentItemCards = () =>
  cy.findAllByTestId("embed-recent-item-card");

export const visitNewEmbedPage = (
  { waitForResource } = { waitForResource: true },
) => {
  cy.intercept("GET", "/api/dashboard/*").as("dashboard");

  cy.visit("/admin/embedding");

  cy.findAllByTestId(/(sdk-setting-card|guest-embeds-setting-card)/)
    .first()
    .within(() => {
      cy.findByText("New embed").click();
    });

  cy.get("body").then(() => {
    if (waitForResource) {
      embedModalEnableEmbedding();

      cy.wait("@dashboard");

      cy.get("[data-iframe-loaded]", { timeout: 20000 }).should(
        "have.length",
        1,
      );
    }
  });
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
      experience: "exploration" | "metabot";
      resourceName?: never;
      preselectSso?: boolean;
    }
  | {
      experience: "dashboard" | "chart" | "browser";
      resourceName: string;
      preselectSso?: boolean;
    };

export const navigateToEntitySelectionStep = (
  options: NavigateToStepOptions,
) => {
  const { experience, preselectSso } = options;

  visitNewEmbedPage();

  cy.log("select an experience");

  const isQuestionOrDashboardExperience =
    experience === "chart" || experience === "dashboard";
  const hasEntitySelection =
    experience !== "exploration" && experience !== "metabot";

  if (preselectSso || !isQuestionOrDashboardExperience) {
    cy.findByLabelText("Metabase account (SSO)").click();
    embedModalEnableEmbedding();
  }

  const labelByExperience = match(experience)
    .with("chart", () => "Chart")
    .with("exploration", () => "Exploration")
    .with("browser", () => "Browser")
    .with("metabot", () => "Metabot")
    .otherwise(() => undefined);

  if (labelByExperience) {
    cy.findByText(labelByExperience).click();
  }

  // exploration and metabot experience does not have the entity selection step
  if (hasEntitySelection && options.resourceName) {
    cy.log("navigate to the entity selection step");

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
    });

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
      cy.findAllByText(options.resourceName).first().click();

      // Collection picker requires an explicit confirmation.
      if (experience === "browser") {
        cy.findByText("Select").click();
      }
    });

    cy.log(`${resourceType} title should be visible by default`);
    getEmbedSidebar().within(() => {
      cy.findByText(options.resourceName).should("be.visible");
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

export const completeWizard = (options: NavigateToStepOptions) => {
  navigateToGetCodeStep(options);

  cy.log("complete wizard");
  getEmbedSidebar().within(() => {
    cy.findByText("Done").click();
  });
};

export const codeBlock = () => cy.get(".cm-content");

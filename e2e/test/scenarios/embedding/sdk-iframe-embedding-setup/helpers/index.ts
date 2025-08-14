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

export const visitNewEmbedPage = ({
  locale,
  dismissEmbedTerms = true,
}: { locale?: string; dismissEmbedTerms?: boolean } = {}) => {
  cy.intercept("GET", "/api/dashboard/*").as("dashboard");

  const params = new URLSearchParams();

  if (locale) {
    params.append("locale", locale);
  }

  cy.visit("/embed-js?" + params);

  if (dismissEmbedTerms) {
    cy.log("simple embedding terms card should be shown");
    cy.findByTestId("simple-embed-terms-card").within(() => {
      cy.findByText("First, some legalese.").should("be.visible");

      cy.findByText(
        "When using Embedded Analytics JS, each end user should have their own Metabase account.",
      ).should("be.visible");

      cy.findByText("Got it").should("be.visible").click();
    });

    cy.log("simple embedding terms card should be dismissed");
    cy.findByTestId("simple-embed-terms-card").should("not.exist");
  }

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
      dismissEmbedTerms?: boolean;
      resourceName?: never;
    }
  | ({ experience: "dashboard" | "chart"; dismissEmbedTerms?: boolean } & (
      | { resourceName: string; skipResourceSelection?: never }
      | { skipResourceSelection: true }
    ));

export const navigateToEntitySelectionStep = (
  options: NavigateToStepOptions,
) => {
  const { experience, dismissEmbedTerms } = options;

  visitNewEmbedPage({ dismissEmbedTerms });

  cy.log("select an experience");

  if (experience === "chart") {
    cy.findByText("Chart").click();
  } else if (experience === "exploration") {
    cy.findByText("Exploration").click();
  }

  // exploration template does not have the entity selection step
  if (experience !== "exploration") {
    cy.log("navigate to the entity selection step");
    getEmbedSidebar().within(() => {
      cy.findByText("Next").click(); // Entity selection step
    });
  }

  if (experience !== "exploration" && !options.skipResourceSelection) {
    const { resourceName } = options;

    const resourceType = match(experience)
      .with("dashboard", () => "Dashboards")
      .with("chart", () => "Questions")
      .otherwise(() => "");

    cy.log(`searching for ${resourceType} via the picker modal`);
    getEmbedSidebar().within(() => {
      cy.findByTestId("embed-browse-entity-button").click();
    });

    entityPickerModal().within(() => {
      cy.findByText(resourceType).click();
      cy.findAllByText(resourceName).first().click();
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
    cy.findByText("Get Code").click(); // Get code step
  });
};

export const codeBlock = () => cy.get(".cm-content");

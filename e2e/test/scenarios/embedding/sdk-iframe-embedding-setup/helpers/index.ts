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

export const getResourceSelectorButton = (
  options?: Partial<Cypress.Timeoutable>,
) => cy.findByTestId("embed-browse-entity-button", options);

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
      preselectGuest?: boolean;
    }
  | {
      experience: "dashboard" | "chart" | "browser";
      resourceName: string;
      preselectSso?: boolean;
      preselectGuest?: boolean;
    };

export const navigateToEntitySelectionStep = (
  options: NavigateToStepOptions,
) => {
  const { experience, preselectSso, preselectGuest } = options;

  visitNewEmbedPage();

  cy.log("select an experience");

  const isQuestionOrDashboardExperience =
    experience === "chart" || experience === "dashboard";
  const hasEntitySelection =
    experience !== "exploration" && experience !== "metabot";

  // Switch to the requested auth mode if we're not already on it. When we
  // ARE already on it (e.g. SSO is the default and `preselectSso` is set),
  // the radio click is a no-op AND the section's terms were already accepted
  // by visitNewEmbedPage()'s embedModalEnableEmbedding() — so calling the
  // helper again would race the now-frozen disabled "Enabled" button.
  const ensureAuthMode = (label: string) => {
    cy.findByLabelText(label).then(($radio) => {
      if ($radio.is(":checked")) {
        return;
      }
      cy.wrap($radio).click();
      embedModalEnableEmbedding();
    });
  };

  if (preselectSso || !isQuestionOrDashboardExperience) {
    ensureAuthMode("Metabase account (SSO)");
  } else if (preselectGuest) {
    ensureAuthMode("Guest");
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

  // Experience selection and resource picker are part of the same step.
  // exploration and metabot do not show a resource picker.
  if (hasEntitySelection && options.resourceName) {
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
      // The picker opens on the "Recent items" tab by default. Scope each
      // navigation step to its column to disambiguate when the target also
      // appears in the recents list.
      cy.findByTestId("item-picker-level-0")
        .findByText("Our analytics")
        .click();
      cy.findByTestId("item-picker-level-1")
        .findAllByText(options.resourceName)
        .first()
        .click();

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

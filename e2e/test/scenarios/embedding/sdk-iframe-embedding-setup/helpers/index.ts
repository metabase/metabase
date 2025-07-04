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

export const visitNewEmbedPage = () => {
  cy.intercept("GET", "/api/dashboard/*").as("dashboard");
  cy.visit("/embed/new");
  cy.wait("@dashboard");

  cy.get("#iframe-embed-container").should(
    "have.attr",
    "data-iframe-loaded",
    "true",
  );
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

export const navigateToEntitySelectionStep = ({
  experience,
}: {
  experience: "dashboard" | "chart" | "exploration";
}) => {
  visitNewEmbedPage();

  cy.log("select an experience");

  if (experience === "chart") {
    cy.findByText("Chart").click();
  } else if (experience === "exploration") {
    cy.findByText("Exploration").click();
  }

  cy.log("navigate to the entity selection step");

  // exploration template does not have the entity selection step
  if (experience !== "exploration") {
    const defaultResourceName = match(experience)
      .with("dashboard", () => "Orders in a dashboard")
      .with("chart", () => "Orders, Count")
      .otherwise(() => "");

    const resourceType = match(experience)
      .with("dashboard", () => "Dashboards")
      .with("chart", () => "Questions")
      .otherwise(() => "");

    getEmbedSidebar().within(() => {
      cy.findByText("Next").click();
      cy.findByTestId("embed-browse-entity-button").click();
    });

    entityPickerModal().within(() => {
      cy.findByText(resourceType).click();
      cy.findAllByText(defaultResourceName).first().click();
    });

    cy.log("resource title should be visible by default");
    getEmbedSidebar().within(() => {
      cy.findByText(defaultResourceName).should("be.visible");
    });
  }
};

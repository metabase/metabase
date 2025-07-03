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

import type {
  CreateDashboardRequest,
  Dashboard,
  DashboardCard,
} from "metabase-types/api";

export interface DashboardDetails extends Omit<CreateDashboardRequest, "name"> {
  name?: string;
  auto_apply_filters?: Dashboard["auto_apply_filters"];
  enable_embedding?: Dashboard["enable_embedding"];
  embedding_params?: Dashboard["embedding_params"];
  dashcards?: Partial<DashboardCard>[];
}

interface Options {
  /**
   * Whether to wrap a dashboard id, to make it available outside of this scope.
   * Defaults to false.
   */
  wrapId?: boolean;
  /**
   * Alias a dashboard id in order to use it later with `cy.get("@" + alias).
   * Defaults to "dashboardId".
   */
  idAlias?: string;
}

export const createDashboard = (
  dashboardDetails: DashboardDetails = {},
  options: Options = {},
): Cypress.Chainable<Cypress.Response<Dashboard>> => {
  const {
    name = "Test Dashboard",
    auto_apply_filters,
    enable_embedding,
    embedding_params,
    dashcards,
    ...restDashboardDetails
  } = dashboardDetails;
  const { wrapId = false, idAlias = "dashboardId" } = options;

  cy.log(`Create a dashboard: ${name}`);

  // For all the possible keys, refer to `src/metabase/api/dashboard.clj`
  return cy
    .request<Dashboard>("POST", "/api/dashboard", {
      name,
      ...restDashboardDetails,
    })
    .then(({ body }) => {
      if (wrapId) {
        cy.wrap(body.id).as(idAlias);
      }
      if (
        enable_embedding != null ||
        auto_apply_filters != null ||
        Array.isArray(dashcards)
      ) {
        cy.request<Dashboard>("PUT", `/api/dashboard/${body.id}`, {
          auto_apply_filters,
          enable_embedding,
          embedding_params,
          dashcards,
        });
      }
    });
};

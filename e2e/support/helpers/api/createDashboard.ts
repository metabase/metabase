import type {
  CreateDashboardRequest,
  Dashboard,
  UpdateDashboardCardRequest,
  UpdateDashboardTabRequest,
} from "metabase-types/api";

import { updateDashboard } from "./updateDashboard";

export interface DashboardDetails extends Omit<CreateDashboardRequest, "name"> {
  name?: string;
  auto_apply_filters?: Dashboard["auto_apply_filters"];
  enable_embedding?: Dashboard["enable_embedding"];
  embedding_type?: Dashboard["embedding_type"];
  embedding_params?: Dashboard["embedding_params"];
  dashcards?: UpdateDashboardCardRequest[];
  tabs?: UpdateDashboardTabRequest[];
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
    embedding_type,
    embedding_params,
    dashcards,
    tabs,
    ...restDashboardDetails
  } = dashboardDetails;
  const { wrapId = false, idAlias = "dashboardId" } = options;

  cy.log(`Create a dashboard: ${name}`);

  // For all the possible keys, refer to `src/metabase/dashboards_rest/api.clj`
  return cy
    .request<Dashboard>("POST", "/api/dashboard", {
      name,
      ...restDashboardDetails,
    })
    .then((response) => {
      if (wrapId) {
        cy.wrap(response.body.id).as(idAlias);
      }
      if (
        enable_embedding != null ||
        auto_apply_filters != null ||
        Array.isArray(dashcards) ||
        Array.isArray(tabs)
      ) {
        return updateDashboard({
          id: response.body.id,
          auto_apply_filters,
          enable_embedding,
          embedding_type,
          embedding_params,
          dashcards,
          tabs,
        });
      }
      // Cypress keeps the POST response when the callback returns undefined, but
      // the types don't; wrap so both branches yield Chainable<Response<Dashboard>>.
      return cy.wrap(response);
    });
};

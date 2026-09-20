import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  ListOAuthAuthorizationsResponse,
  OAuthClientSummary,
} from "metabase-types/api";

export function setupOAuthClientsEndpoint(
  clients: OAuthClientSummary[] = [],
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/oauth/clients", clients, options);
}

export function setupOAuthAuthorizationsEndpoint(
  response: ListOAuthAuthorizationsResponse,
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/oauth/authorizations", response, options);
}

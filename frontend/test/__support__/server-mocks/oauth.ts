import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type { ListOAuthAuthorizationsResponse } from "metabase-types/api";

export function setupOAuthAuthorizationsEndpoint(
  response: ListOAuthAuthorizationsResponse,
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/oauth/authorizations", response, options);
}

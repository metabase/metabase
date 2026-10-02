import fetchMock from "fetch-mock";

import type {
  OAuthClient,
  OAuthClientListResponse,
  RevokeOAuthClientsResponse,
} from "metabase-types/api";
import { createMockRevokeOAuthClientsResponse } from "metabase-types/api/mocks";

export const setupListOAuthClientsEndpoint = (
  clients: OAuthClient[] = [],
  overrides: Partial<OAuthClientListResponse> = {},
) => {
  const response: OAuthClientListResponse = {
    data: clients,
    total: clients.length,
    limit: null,
    offset: null,
    ...overrides,
  };
  fetchMock.get("path:/api/ee/oauth-client-management", response);
};

export const setupListOAuthClientsErrorEndpoint = () => {
  fetchMock.get("path:/api/ee/oauth-client-management", { status: 500 });
};

export const setupRevokeOAuthClientsEndpoint = (
  response: RevokeOAuthClientsResponse = createMockRevokeOAuthClientsResponse(),
) => {
  fetchMock.post("path:/api/ee/oauth-client-management/revoke", response);
};

export const setupRevokeOAuthClientsErrorEndpoint = () => {
  fetchMock.post("path:/api/ee/oauth-client-management/revoke", {
    status: 500,
  });
};

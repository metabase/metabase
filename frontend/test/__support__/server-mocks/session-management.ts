import fetchMock from "fetch-mock";

import type {
  AdminSession,
  AdminSessionListResponse,
  RevokeAdminSessionsResponse,
} from "metabase-types/api";
import { createMockRevokeAdminSessionsResponse } from "metabase-types/api/mocks";

export const setupAdminListSessionsEndpoint = (
  sessions: AdminSession[] = [],
  overrides: Partial<AdminSessionListResponse> = {},
) => {
  const response: AdminSessionListResponse = {
    data: sessions,
    total: sessions.length,
    limit: null,
    offset: null,
    ...overrides,
  };
  fetchMock.get("path:/api/ee/session-management", response);
};

export const setupAdminListSessionsErrorEndpoint = () => {
  fetchMock.get("path:/api/ee/session-management", { status: 500 });
};

export const setupRevokeAdminSessionsEndpoint = (
  response: RevokeAdminSessionsResponse = createMockRevokeAdminSessionsResponse(),
) => {
  fetchMock.post("path:/api/ee/session-management/revoke", response);
};

export const setupRevokeAdminSessionsErrorEndpoint = () => {
  fetchMock.post("path:/api/ee/session-management/revoke", { status: 500 });
};

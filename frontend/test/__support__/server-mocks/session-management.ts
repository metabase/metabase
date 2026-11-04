import fetchMock, { type UserRouteConfig } from "fetch-mock";

import type {
  RevokeSessionsResponse,
  Session,
  SessionCountsResponse,
  SessionListResponse,
} from "metabase-types/api";
import { createMockRevokeSessionsResponse } from "metabase-types/api/mocks";

export function setupSessionCountsEndpoint(
  response: SessionCountsResponse = { active: 0, ended: 0 },
  options?: UserRouteConfig,
) {
  fetchMock.get("path:/api/ee/session-management/counts", response, options);
}

export function setupSessionCountsErrorEndpoint() {
  fetchMock.get("path:/api/ee/session-management/counts", { status: 500 });
}

export const setupListSessionsEndpoint = (
  sessions: Session[] = [],
  overrides: Partial<SessionListResponse> = {},
) => {
  const response: SessionListResponse = {
    data: sessions,
    total: sessions.length,
    limit: null,
    offset: null,
    ...overrides,
  };
  fetchMock.get("path:/api/ee/session-management", response);
};

export const setupListSessionsErrorEndpoint = () => {
  fetchMock.get("path:/api/ee/session-management", { status: 500 });
};

export const setupRevokeSessionsEndpoint = (
  response: RevokeSessionsResponse = createMockRevokeSessionsResponse(),
) => {
  fetchMock.post("path:/api/ee/session-management/revoke", response);
};

export const setupRevokeSessionsErrorEndpoint = ({
  status = 500,
  message,
}: { status?: number; message?: string } = {}) => {
  fetchMock.post("path:/api/ee/session-management/revoke", {
    status,
    body: message === undefined ? undefined : { message },
  });
};

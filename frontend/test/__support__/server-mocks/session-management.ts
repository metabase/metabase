import fetchMock from "fetch-mock";

import type {
  RevokeSessionsResponse,
  Session,
  SessionListResponse,
} from "metabase-types/api";
import { createMockRevokeSessionsResponse } from "metabase-types/api/mocks";

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

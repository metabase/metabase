import type { ApiKey } from "metabase-types/api";

import { apiKeyMatchesScope, apiKeyUsageEventColumnKeys } from "./query-utils";

const apiKey: ApiKey = {
  id: 1,
  name: "Test key",
  group: { id: 2, name: "Administrators" },
  creator_id: 3,
  masked_key: "mb_************abcd",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  updated_by: { id: 3, common_name: "Admin" },
  last_used_at: null,
};

describe("apiKeyMatchesScope", () => {
  it("matches when no filters are set", () => {
    expect(apiKeyMatchesScope(apiKey, {})).toBe(true);
  });

  it("matches on api key id", () => {
    expect(apiKeyMatchesScope(apiKey, { apiKeyId: 1 })).toBe(true);
    expect(apiKeyMatchesScope(apiKey, { apiKeyId: 99 })).toBe(false);
  });

  it("matches on creator id", () => {
    expect(apiKeyMatchesScope(apiKey, { userId: 3 })).toBe(true);
    expect(apiKeyMatchesScope(apiKey, { userId: 99 })).toBe(false);
  });

  it("matches on group id", () => {
    expect(apiKeyMatchesScope(apiKey, { groupId: 2 })).toBe(true);
    expect(apiKeyMatchesScope(apiKey, { groupId: 99 })).toBe(false);
  });

  it("requires every set filter to match", () => {
    expect(apiKeyMatchesScope(apiKey, { apiKeyId: 1, userId: 99 })).toBe(false);
  });
});

describe("apiKeyUsageEventColumnKeys", () => {
  it("returns only the base columns when PII retention is off", () => {
    expect(apiKeyUsageEventColumnKeys(false)).toEqual([
      "log_id",
      "occurred_at",
      "route_template",
      "http_method",
      "status",
      "duration_ms",
      "api_key_name",
      "creator_display_name",
      "client_display_name",
      "embedding_client",
      "embedding_hostname",
    ]);
  });

  it("includes ip_address only when PII retention is on", () => {
    expect(apiKeyUsageEventColumnKeys(true)).toEqual([
      "log_id",
      "occurred_at",
      "route_template",
      "http_method",
      "status",
      "duration_ms",
      "api_key_name",
      "creator_display_name",
      "client_display_name",
      "embedding_client",
      "embedding_hostname",
      "ip_address",
    ]);
  });
});

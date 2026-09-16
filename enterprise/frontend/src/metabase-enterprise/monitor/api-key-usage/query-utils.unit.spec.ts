import { apiKeyUsageEventColumnKeys } from "./query-utils";

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
      "user_display_name",
      "client_display_name",
      "embedding_client",
      "embedding_hostname",
    ]);
  });

  it("includes ip_address only when PII retention is on", () => {
    const withPii = apiKeyUsageEventColumnKeys(true);
    expect(withPii).toContain("ip_address");
  });
});

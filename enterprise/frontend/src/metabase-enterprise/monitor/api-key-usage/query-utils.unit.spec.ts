import { apiKeyUsageEventColumnKeys } from "./query-utils";

describe("apiKeyUsageEventColumnKeys", () => {
  it("returns only the base columns when tenants and PII retention are both off", () => {
    expect(apiKeyUsageEventColumnKeys(false, false)).toEqual([
      "log_id",
      "created_at",
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

  it("includes tenant_name only when tenants are enabled", () => {
    const withTenants = apiKeyUsageEventColumnKeys(true, false);
    expect(withTenants).toContain("tenant_name");
    expect(withTenants).not.toContain("ip_address");
  });

  it("includes ip_address only when PII retention is on", () => {
    const withPii = apiKeyUsageEventColumnKeys(false, true);
    expect(withPii).toContain("ip_address");
    expect(withPii).not.toContain("tenant_name");
  });

  it("includes every column when both tenants and PII retention are enabled", () => {
    expect(apiKeyUsageEventColumnKeys(true, true)).toEqual([
      "log_id",
      "created_at",
      "route_template",
      "http_method",
      "status",
      "duration_ms",
      "api_key_name",
      "user_display_name",
      "client_display_name",
      "embedding_client",
      "embedding_hostname",
      "tenant_name",
      "ip_address",
    ]);
  });
});

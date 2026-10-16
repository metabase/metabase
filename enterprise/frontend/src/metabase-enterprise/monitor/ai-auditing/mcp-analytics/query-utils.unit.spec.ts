import { mcpEventColumnKeys } from "./query-utils";

describe("mcpEventColumnKeys", () => {
  it("returns only the base columns when tenants and PII retention are both off", () => {
    expect(mcpEventColumnKeys(false, false)).toEqual([
      "tool_call_id",
      "created_at",
      "tool_name",
      "client_display_name",
      "client_version",
      "user_display_name",
      "status",
      "duration_ms",
      "error_type",
    ]);
  });

  it("includes tenant_name only when tenants are enabled", () => {
    const withTenants = mcpEventColumnKeys(true, false);
    expect(withTenants).toContain("tenant_name");
    expect(withTenants).not.toContain("ip_address");
    expect(withTenants).not.toContain("error_message");
  });

  it("includes ip_address and error_message only when PII retention is on", () => {
    const withPii = mcpEventColumnKeys(false, true);
    expect(withPii).toContain("ip_address");
    expect(withPii).toContain("error_message");
    expect(withPii).not.toContain("tenant_name");
  });

  it("includes every column when both tenants and PII retention are enabled", () => {
    expect(mcpEventColumnKeys(true, true)).toEqual([
      "tool_call_id",
      "created_at",
      "tool_name",
      "client_display_name",
      "client_version",
      "user_display_name",
      "tenant_name",
      "ip_address",
      "status",
      "duration_ms",
      "error_type",
      "error_message",
    ]);
  });
});

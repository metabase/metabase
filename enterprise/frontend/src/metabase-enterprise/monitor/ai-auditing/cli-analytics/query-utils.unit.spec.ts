import { cliEventColumnKeys } from "./query-utils";

describe("cliEventColumnKeys", () => {
  it("returns only the base columns when tenants and PII retention are both off", () => {
    expect(cliEventColumnKeys(false, false)).toEqual([
      "call_id",
      "created_at",
      "operation",
      "client_display_name",
      "user_display_name",
      "status",
      "duration_ms",
    ]);
  });

  it("includes tenant_name only when tenants are enabled", () => {
    const withTenants = cliEventColumnKeys(true, false);
    expect(withTenants).toContain("tenant_name");
    expect(withTenants).not.toContain("ip_address");
    expect(withTenants).not.toContain("error_message");
  });

  it("includes ip_address and error_message only when PII retention is on", () => {
    const withPii = cliEventColumnKeys(false, true);
    expect(withPii).toContain("ip_address");
    expect(withPii).toContain("error_message");
    expect(withPii).not.toContain("tenant_name");
  });

  it("includes every column when both tenants and PII retention are enabled", () => {
    expect(cliEventColumnKeys(true, true)).toEqual([
      "call_id",
      "created_at",
      "operation",
      "client_display_name",
      "user_display_name",
      "tenant_name",
      "ip_address",
      "status",
      "duration_ms",
      "error_message",
    ]);
  });
});

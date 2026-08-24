import { eventColumns } from "./CliEventsTable";

const keys = (hasTenants: boolean, hasPii: boolean) =>
  eventColumns(hasTenants, hasPii).map((column) => column.key);

describe("eventColumns", () => {
  it("surfaces the curated columns in display order (ID first, Tenant + IP after User)", () => {
    expect(keys(true, true)).toEqual([
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

  it("includes the Tenant column only when tenants are enabled", () => {
    expect(keys(true, true)).toContain("tenant_name");
    expect(keys(false, true)).not.toContain("tenant_name");
  });

  it("includes the PII columns (IP + error message) only when retention is on", () => {
    expect(keys(true, true)).toEqual(
      expect.arrayContaining(["ip_address", "error_message"]),
    );
    const withoutPii = keys(true, false);
    expect(withoutPii).not.toContain("ip_address");
    expect(withoutPii).not.toContain("error_message");
  });

  it("never surfaces raw/sensitive columns (client_name, raw ids, group_name)", () => {
    const all = keys(true, true);
    expect(all).not.toContain("client_name");
    expect(all).not.toContain("user_id");
    expect(all).not.toContain("tenant_id");
    expect(all).not.toContain("group_name");
  });

  it("marks every column sortable", () => {
    const columns = eventColumns(true, true);
    expect(columns.every((c) => c.sort)).toBe(true);
    expect(columns.map((c) => c.sort)).toEqual(columns.map((c) => c.key));
  });
});

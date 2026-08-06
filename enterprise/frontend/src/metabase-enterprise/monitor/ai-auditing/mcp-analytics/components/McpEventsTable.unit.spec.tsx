import { eventColumns } from "./McpEventsTable";

const keys = (hasTenants: boolean, hasPii: boolean) =>
  eventColumns(hasTenants, hasPii).map((column) => column.key);

describe("eventColumns", () => {
  it("surfaces the curated columns in display order (ID first, Tenant + IP after User)", () => {
    expect(keys(true, true)).toEqual([
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
    // error_type (non-PII) is always surfaced, unlike error_message
    expect(withoutPii).toContain("error_type");
  });

  it("never surfaces raw/sensitive columns (user_agent, raw ids, client_name)", () => {
    const all = keys(true, true);
    expect(all).not.toContain("user_agent");
    expect(all).not.toContain("client_name");
    expect(all).not.toContain("user_id");
    expect(all).not.toContain("mcp_session_id");
  });

  it("marks every column sortable, keyed by its own view column name", () => {
    const columns = eventColumns(true, true);
    for (const column of columns) {
      expect(column.sort).toBe(column.key);
    }
  });
});

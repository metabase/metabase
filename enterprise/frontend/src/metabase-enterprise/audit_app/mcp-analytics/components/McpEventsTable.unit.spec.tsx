import type { DatasetQuery } from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";

import { buildEventsRawSeries } from "./McpEventsTable";

type EventsData = Parameters<typeof buildEventsRawSeries>[0];

const col = (name: string, display_name: string) =>
  createMockColumn({ name, display_name });

// Every view column the events query returns, with default humanized headers. Names are
// UPPER-CASE to mirror the H2 audit DB (which upper-cases identifiers) — the curated set is
// matched case-insensitively, so this guards against the all-hidden regression.
const ALL_COLS = [
  col("TOOL_CALL_ID", "Tool Call Id"),
  col("CREATED_AT", "Created At"),
  col("TOOL_NAME", "Tool Name"),
  col("STATUS", "Status"),
  col("ERROR_TYPE", "Error Type"),
  col("ERROR_MESSAGE", "Error Message"),
  col("DURATION_MS", "Duration Ms"),
  col("MCP_SESSION_ID", "Mcp Session Id"),
  col("USER_ID", "User Id"),
  col("USER_DISPLAY_NAME", "User Display Name"),
  col("GROUP_NAME", "Group Name"),
  col("CLIENT_NAME", "Client Name"),
  col("CLIENT_DISPLAY_NAME", "Client Display Name"),
  col("CLIENT_VERSION", "Client Version"),
  col("TENANT_ID", "Tenant Id"),
  col("TENANT_NAME", "Tenant Name"),
  col("IP_ADDRESS", "Ip Address"),
  col("USER_AGENT", "User Agent"),
];

// Unjustified type cast. FIXME
const jsQuery = { database: 1, type: "query", query: {} } as DatasetQuery;

function build(cols = ALL_COLS, hasTenants = true, hasPii = true) {
  // Unjustified type cast. FIXME
  const data = { data: { cols, rows: [[]] } } as unknown as EventsData;
  const series = buildEventsRawSeries(data, jsQuery, hasTenants, hasPii);
  if (!series) {
    throw new Error("expected a rawSeries");
  }
  return series[0];
}

/** The card's `table.columns` setting, narrowed past the all-hidden fallback branch. */
function surfacedTableColumns(
  cols = ALL_COLS,
  hasTenants = true,
  hasPii = true,
) {
  const { card } = build(cols, hasTenants, hasPii);
  if (!("visualization_settings" in card)) {
    throw new Error("expected table.columns to be set");
  }
  // Unjustified type cast. FIXME
  return card.visualization_settings["table.columns"] as {
    name: string;
    enabled: boolean;
  }[];
}

const enabledNames = (cols: { name: string; enabled: boolean }[]) =>
  cols.filter((c) => c.enabled).map((c) => c.name);

describe("buildEventsRawSeries", () => {
  it("returns null without data or query", () => {
    expect(buildEventsRawSeries(undefined, jsQuery, true, true)).toBeNull();
    expect(
      buildEventsRawSeries(
        // Unjustified type cast. FIXME
        { data: { cols: [], rows: [] } } as unknown as EventsData,
        null,
        true,
        true,
      ),
    ).toBeNull();
  });

  it("fails closed: returns null when no curated column is present (no all-columns leak)", () => {
    const foreign = [
      col("WEIRD_A", "Weird A"),
      col("USER_AGENT", "User Agent"),
    ];
    // Unjustified type cast. FIXME
    const data = {
      data: { cols: foreign, rows: [[]] },
    } as unknown as EventsData;
    expect(buildEventsRawSeries(data, jsQuery, true, true)).toBeNull();
  });

  it("surfaces only the curated columns, in order (ID first, Tenant + IP after User)", () => {
    expect(enabledNames(surfacedTableColumns())).toEqual([
      "TOOL_CALL_ID",
      "CREATED_AT",
      "TOOL_NAME",
      "CLIENT_DISPLAY_NAME",
      "CLIENT_VERSION",
      "USER_DISPLAY_NAME",
      "TENANT_NAME",
      "IP_ADDRESS",
      "STATUS",
      "DURATION_MS",
      "ERROR_TYPE",
      "ERROR_MESSAGE",
    ]);
  });

  it("includes the Tenant column only when tenants are enabled", () => {
    expect(enabledNames(surfacedTableColumns(ALL_COLS, true, true))).toContain(
      "TENANT_NAME",
    );
    expect(
      enabledNames(surfacedTableColumns(ALL_COLS, false, true)),
    ).not.toContain("TENANT_NAME");
  });

  it("includes the IP column only when PII retention is on", () => {
    expect(enabledNames(surfacedTableColumns(ALL_COLS, true, true))).toContain(
      "IP_ADDRESS",
    );
    expect(
      enabledNames(surfacedTableColumns(ALL_COLS, true, false)),
    ).not.toContain("IP_ADDRESS");
  });

  it("includes the Error message column only when PII retention is on", () => {
    // error_message is gated PII (written only when retention is on), like ip_address; error_type
    // (non-PII) is always surfaced.
    expect(enabledNames(surfacedTableColumns(ALL_COLS, true, true))).toContain(
      "ERROR_MESSAGE",
    );
    const withoutPii = enabledNames(
      surfacedTableColumns(ALL_COLS, true, false),
    );
    expect(withoutPii).not.toContain("ERROR_MESSAGE");
    expect(withoutPii).toContain("ERROR_TYPE");
  });

  it("explicitly hides the extraneous columns (incl. raw tenant_id) so they don't leak", () => {
    const tableColumns = surfacedTableColumns();
    const disabled = tableColumns.filter((c) => !c.enabled).map((c) => c.name);
    expect(disabled).toEqual(
      expect.arrayContaining([
        "MCP_SESSION_ID",
        "USER_ID",
        "CLIENT_NAME",
        "TENANT_ID",
        "USER_AGENT",
      ]),
    );
    // every column is accounted for, so nothing is appended unlisted
    expect(tableColumns).toHaveLength(ALL_COLS.length);
  });

  it("overrides surfaced headers to Sentence case, leaving hidden columns untouched", () => {
    const titles = Object.fromEntries(
      build().data.cols.map((c) => [c.name, c.display_name]),
    );

    expect(titles).toMatchObject({
      TOOL_CALL_ID: "ID",
      TOOL_NAME: "Tool",
      CLIENT_DISPLAY_NAME: "Client",
      USER_DISPLAY_NAME: "User",
      TENANT_NAME: "Tenant",
      IP_ADDRESS: "IP address",
      DURATION_MS: "Duration (ms)",
      ERROR_TYPE: "Error type",
      ERROR_MESSAGE: "Error message",
      // an untouched (hidden) column keeps its original header
      USER_AGENT: "User Agent",
    });
  });
});

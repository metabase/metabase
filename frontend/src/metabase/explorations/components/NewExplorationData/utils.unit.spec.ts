import type {
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";
import { createMockMetricDimension } from "metabase-types/api/mocks/metric";

import {
  filterDimensionGroupsBySearch,
  groupDimensionsByGroupSource,
} from "./utils";

const dimOrdersCreatedAt = createMockMetricDimension({
  id: "orders.created_at",
  display_name: "Created At",
  group: {
    id: "orders",
    type: "main",
    display_name: "Orders",
  },
  dimension_interestingness: 0.9,
});

const dimOrdersTotal = createMockMetricDimension({
  id: "orders.total",
  display_name: "Total",
  group: {
    id: "orders",
    type: "main",
    display_name: "Orders",
  },
  dimension_interestingness: 0.7,
});

const dimAccountsPlan = createMockMetricDimension({
  id: "accounts.plan",
  display_name: "Plan",
  group: {
    id: "accounts",
    type: "connection",
    display_name: "Accounts",
  },
  dimension_interestingness: 0.6,
});

const dimUngrouped = createMockMetricDimension({
  id: "loose.thing",
  display_name: "Thing",
  dimension_interestingness: 0.3,
});

describe("groupDimensionsByGroupSource", () => {
  it("returns an empty list when given no dimensions", () => {
    expect(groupDimensionsByGroupSource([])).toEqual([]);
  });

  it("buckets dimensions by their `group.id` and labels sections with the group's display_name", () => {
    const rows = groupDimensionsByGroupSource([
      dimOrdersCreatedAt,
      dimOrdersTotal,
      dimAccountsPlan,
    ]);

    // Expect 2 sections: Orders (max 0.9) and Accounts (max 0.6).
    // Sections are ordered by max interestingness desc, so Orders
    // is first.
    expect(
      rows.map((r) => (r.type === "header" ? `# ${r.label}` : r.dimension.id)),
    ).toEqual([
      "# Orders",
      "orders.created_at",
      "orders.total",
      "# Accounts",
      "accounts.plan",
    ]);
  });

  it("falls back to an 'Other' section for dimensions with no `group`", () => {
    const rows = groupDimensionsByGroupSource([
      dimOrdersCreatedAt,
      dimUngrouped,
    ]);

    const headers = rows
      .filter((r) => r.type === "header")
      .map((r) => (r.type === "header" ? r.label : ""));
    expect(headers).toEqual(["Orders", "Other"]);
  });

  it("sorts dimensions within a section by interestingness descending", () => {
    // Pass in ascending-interestingness order; the in-section order
    // should come back most-interesting-first regardless of input.
    const rows = groupDimensionsByGroupSource([
      dimOrdersTotal, // 0.7
      dimOrdersCreatedAt, // 0.9
    ]);
    const dims = rows
      .filter((r) => r.type === "dimension")
      .map((r) => (r.type === "dimension" ? r.dimension.id : ""));
    expect(dims).toEqual(["orders.created_at", "orders.total"]);
  });

  it("orders sections by the max interestingness of their dimensions, not the average", () => {
    // Orders has a polarized spread (0.95 + 0.1 → avg 0.525, max 0.95);
    // Accounts is uniformly mid (0.6 + 0.6 → avg 0.6, max 0.6). Average
    // ordering would put Accounts first; max ordering puts Orders first
    // because it owns the single most interesting dimension.
    const ordersHot = createMockMetricDimension({
      id: "orders.hot",
      group: { id: "orders", type: "main", display_name: "Orders" },
      dimension_interestingness: 0.95,
    });
    const ordersCold = createMockMetricDimension({
      id: "orders.cold",
      group: { id: "orders", type: "main", display_name: "Orders" },
      dimension_interestingness: 0.1,
    });
    const accountsA = createMockMetricDimension({
      id: "accounts.a",
      group: { id: "accounts", type: "connection", display_name: "Accounts" },
      dimension_interestingness: 0.6,
    });
    const accountsB = createMockMetricDimension({
      id: "accounts.b",
      group: { id: "accounts", type: "connection", display_name: "Accounts" },
      dimension_interestingness: 0.6,
    });

    const rows = groupDimensionsByGroupSource([
      // Feed Accounts first to prove ordering isn't just input order.
      accountsA,
      accountsB,
      ordersHot,
      ordersCold,
    ]);

    const headers = rows
      .filter((r) => r.type === "header")
      .map((r) => (r.type === "header" ? r.label : ""));
    expect(headers).toEqual(["Orders", "Accounts"]);
  });
});

describe("filterDimensionGroupsBySearch", () => {
  function makeGroup(
    name: string,
    dimensions: MetricDimension[] = [],
  ): ExplorationDimensionGroup {
    return { name, dimension_interestingness: null, dimensions };
  }

  const country = makeGroup("Country", [
    createMockMetricDimension({ id: "g1", display_name: "Country" }),
  ]);
  const plan = makeGroup("Plan", [
    createMockMetricDimension({ id: "g2", display_name: "Plan" }),
  ]);

  it("returns every group untouched for an empty / whitespace query", () => {
    const groups = [country, plan];
    expect(filterDimensionGroupsBySearch(groups, "")).toBe(groups);
    expect(filterDimensionGroupsBySearch(groups, "   ")).toBe(groups);
  });

  it("keeps only groups whose name matches the query (case-insensitive)", () => {
    expect(filterDimensionGroupsBySearch([country, plan], "COUN")).toEqual([
      country,
    ]);
  });

  it("matches on a contained dimension's display name even when the group name doesn't", () => {
    const orders = makeGroup("Orders", [
      createMockMetricDimension({ id: "d1", display_name: "Quantity" }),
      createMockMetricDimension({ id: "d2", display_name: "Created At" }),
    ]);

    expect(filterDimensionGroupsBySearch([orders, plan], "created")).toEqual([
      orders,
    ]);
  });

  it("matches on a dimension's source-group display name", () => {
    const sourced = makeGroup("Total", [
      createMockMetricDimension({
        id: "s1",
        display_name: "Total",
        group: { id: "grp", type: "main", display_name: "Products" },
      }),
    ]);

    expect(filterDimensionGroupsBySearch([sourced, plan], "produc")).toEqual([
      sourced,
    ]);
  });

  it("returns [] when nothing matches", () => {
    expect(filterDimensionGroupsBySearch([country, plan], "zzz")).toEqual([]);
  });
});

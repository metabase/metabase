import type {
  ExplorationDimensionGroup,
  MetricDimension,
} from "metabase-types/api";
import { createMockMetricDimension } from "metabase-types/api/mocks/metric";

import { filterDimensionGroupsBySearch, formatDimensionLabel } from "./utils";

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

describe("formatDimensionLabel", () => {
  it("uses the dimension's own curated name, not an '<origin> - <name>' combination", () => {
    expect(
      formatDimensionLabel(
        createMockMetricDimension({
          id: "d1",
          display_name: "Created At",
          group: { id: "grp", type: "main", display_name: "Orders" },
        }),
      ),
    ).toBe("Created At");
  });

  it("falls back to the id when the dimension has no display name", () => {
    expect(
      formatDimensionLabel(
        createMockMetricDimension({ id: "d2", display_name: undefined }),
      ),
    ).toBe("d2");
  });
});

import type { AvailableDimension, AvailableDimensionsResult } from "./tabs";
import { buildDimensionPickerSections, resolveCommonTabLabel } from "./tabs";

describe("resolveCommonTabLabel", () => {
  it("returns fallback for empty array", () => {
    expect(resolveCommonTabLabel([], "Time")).toBe("Time");
  });

  it("returns the name when only one is provided", () => {
    expect(resolveCommonTabLabel(["Created At"], "Time")).toBe("Created At");
  });

  it("returns the name when all names are identical", () => {
    expect(resolveCommonTabLabel(["Created At", "Created At"], "Time")).toBe(
      "Created At",
    );
  });

  it("returns the most frequent name", () => {
    expect(
      resolveCommonTabLabel(["Created At", "Order Date", "Created At"], "Time"),
    ).toBe("Created At");
  });

  it("returns the first name when tied", () => {
    expect(resolveCommonTabLabel(["State", "Category"], "Location")).toBe(
      "State",
    );
  });

  it("returns the first name when two different names are tied", () => {
    expect(resolveCommonTabLabel(["Created At", "Order Date"], "Time")).toBe(
      "Created At",
    );
  });
});

function createMockAvailableDimension(
  overrides: Partial<AvailableDimension> & { dimensionId: string },
): AvailableDimension {
  return {
    label: overrides.dimensionId,
    icon: "string",
    sourceIds: [],
    tabType: "category",
    ...overrides,
  };
}

describe("buildDimensionPickerSections", () => {
  it("builds flat sections for a single source without groups", () => {
    const dimensions: AvailableDimensionsResult = {
      shared: [],
      bySource: {
        "metric:1": [
          createMockAvailableDimension({ dimensionId: "category", label: "Category" }),
          createMockAvailableDimension({ dimensionId: "state", label: "State" }),
        ],
      },
    };

    const sections = buildDimensionPickerSections({
      availableDimensions: dimensions,
      sourceOrder: ["metric:1"],
      sourceDataById: {
        "metric:1": { type: "metric", name: "Revenue" },
      },
      hasMultipleSources: false,
    });

    expect(sections).toEqual([
      {
        name: undefined,
        items: [
          expect.objectContaining({ name: "Category", dimensionId: "category" }),
          expect.objectContaining({ name: "State", dimensionId: "state" }),
        ],
      },
    ]);
  });

  it("splits by source and includes shared section for multiple sources", () => {
    const sharedDimension = createMockAvailableDimension({
      dimensionId: "created_at",
      label: "Created At",
      sourceIds: ["metric:1", "metric:2"],
    });

    const dimensions: AvailableDimensionsResult = {
      shared: [sharedDimension],
      bySource: {
        "metric:1": [
          createMockAvailableDimension({ dimensionId: "category", label: "Category" }),
        ],
        "metric:2": [
          createMockAvailableDimension({ dimensionId: "status", label: "Status" }),
        ],
      },
    };

    const sections = buildDimensionPickerSections({
      availableDimensions: dimensions,
      sourceOrder: ["metric:1", "metric:2"],
      sourceDataById: {
        "metric:1": { type: "metric", name: "Revenue" },
        "metric:2": { type: "metric", name: "Orders" },
      },
      hasMultipleSources: true,
    });

    expect(sections).toEqual([
      {
        name: "Shared",
        items: [
          expect.objectContaining({ name: "Created At", dimensionId: "created_at" }),
        ],
      },
      {
        name: "Revenue",
        items: [
          expect.objectContaining({ name: "Category", dimensionId: "category" }),
        ],
      },
      {
        name: "Orders",
        items: [
          expect.objectContaining({ name: "Status", dimensionId: "status" }),
        ],
      },
    ]);
  });
});

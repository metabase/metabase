import type {
  AvailableDimension,
  AvailableDimensionsResult,
} from "./dimension-picker";
import { buildDimensionPickerSections } from "./dimension-picker";
import { resolveCommonTabLabel } from "./tabs";

describe("resolveCommonTabLabel", () => {
  it("returns null for empty array", () => {
    expect(resolveCommonTabLabel([])).toBeNull();
  });

  it("returns the name when only one is provided", () => {
    expect(resolveCommonTabLabel(["Created At"])).toBe("Created At");
  });

  it("returns the name when all names are identical", () => {
    expect(resolveCommonTabLabel(["Created At", "Created At"])).toBe(
      "Created At",
    );
  });

  it("returns the most frequent name", () => {
    expect(
      resolveCommonTabLabel(["Created At", "Order Date", "Created At"]),
    ).toBe("Created At");
  });

  it("returns the first name when tied", () => {
    expect(resolveCommonTabLabel(["State", "Category"])).toBe("State");
  });

  it("returns the first name when two different names are tied", () => {
    expect(resolveCommonTabLabel(["Created At", "Order Date"])).toBe(
      "Created At",
    );
  });
});

function createMockAvailableDimension(label: string): AvailableDimension {
  return {
    icon: "string",
    tabInfo: {
      type: "category",
      label,
      dimensionMapping: {},
    },
  };
}

describe("buildDimensionPickerSections", () => {
  it("builds flat sections for a single source without groups", () => {
    const dimensions: AvailableDimensionsResult = {
      shared: [],
      bySource: {
        "metric:1": [
          createMockAvailableDimension("Category"),
          createMockAvailableDimension("State"),
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
          expect.objectContaining({ name: "Category" }),
          expect.objectContaining({ name: "State" }),
        ],
      },
    ]);
  });

  it("splits by source and includes shared section for multiple sources", () => {
    const sharedDimension = createMockAvailableDimension("Created At");

    const dimensions: AvailableDimensionsResult = {
      shared: [sharedDimension],
      bySource: {
        "metric:1": [createMockAvailableDimension("Category")],
        "metric:2": [createMockAvailableDimension("Status")],
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
        items: [expect.objectContaining({ name: "Created At" })],
      },
      {
        name: "Revenue",
        items: [expect.objectContaining({ name: "Category" })],
      },
      {
        name: "Orders",
        items: [expect.objectContaining({ name: "Status" })],
      },
    ]);
  });
});

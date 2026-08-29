import type { DefinitionSource } from "metabase/metrics-viewer/utils/definition-sources";
import type * as LibMetric from "metabase-lib/metric";
import type {
  DimensionDisplayInfo,
  SegmentDisplayInfo,
} from "metabase-lib/metric";
import * as LibMetricModule from "metabase-lib/metric";

import { filterDisplayGroupsBySearch, getMetricGroups } from "./utils";

jest.mock("metabase-lib/metric", () => ({
  __esModule: true,
  filterableDimensions: jest.fn(),
  availableSegments: jest.fn(),
  displayInfo: jest.fn(),
}));

jest.mock("metabase/metrics-viewer/utils/definition-sources", () => ({
  __esModule: true,
  getDefinitionSourceIcon: jest.fn(() => "metric" as const),
  getDefinitionSourceName: jest.fn(() => "Revenue"),
}));

// Unjustified type cast. FIXME
const mockLibMetric = LibMetricModule as jest.Mocked<typeof LibMetric>;

type TestItem = { name: string };

type TestGroup = {
  id: string;
  sections: { name: string; items: TestItem[] }[];
};

function makeGroup(id: string, items: { name: string }[][]): TestGroup {
  return {
    id,
    sections: items.map((sectionItems, index) => ({
      name: `Section ${index}`,
      items: sectionItems,
    })),
  };
}

function makeDefinitionSource(
  index: number,
  overrides: Partial<DefinitionSource> = {},
): DefinitionSource {
  return {
    index,
    // Unjustified type cast. FIXME
    id: `src-${index}` as DefinitionSource["id"],
    // Unjustified type cast. FIXME
    definition: {
      __fakeDefinition: index,
    } as unknown as LibMetric.MetricDefinition,
    // Unjustified type cast. FIXME
    entity: {} as DefinitionSource["entity"],
    entityIndex: index,
    token: undefined,
    ...overrides,
  };
}

function getDimensionInfo(
  displayName: string,
  group: DimensionDisplayInfo["group"],
): DimensionDisplayInfo {
  // Unjustified type cast. FIXME
  return {
    displayName,
    group,
  } as DimensionDisplayInfo;
}

function getSegmentInfo(displayName: string): SegmentDisplayInfo {
  return { displayName };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("filterDisplayGroupsBySearch", () => {
  const groups: TestGroup[] = [
    makeGroup("revenue", [
      [{ name: "Created At" }, { name: "Updated At" }],
      [{ name: "Category" }, { name: "Region" }],
    ]),
    makeGroup("orders", [[{ name: "Order Date" }, { name: "Created At" }]]),
  ];

  it("returns null for empty search text", () => {
    expect(filterDisplayGroupsBySearch(groups, "")).toBeNull();
  });

  it("returns null for whitespace-only search text", () => {
    expect(filterDisplayGroupsBySearch(groups, "   ")).toBeNull();
  });

  it("filters items with case-insensitive partial match", () => {
    expect(filterDisplayGroupsBySearch(groups, "created")).toEqual([
      {
        id: "revenue",
        sections: [{ name: "Section 0", items: [{ name: "Created At" }] }],
      },
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Created At" }] }],
      },
    ]);
  });

  it("matches items across multiple sections in a group", () => {
    expect(filterDisplayGroupsBySearch(groups, "at")).toEqual([
      {
        id: "revenue",
        sections: [
          {
            name: "Section 0",
            items: [{ name: "Created At" }, { name: "Updated At" }],
          },
          { name: "Section 1", items: [{ name: "Category" }] },
        ],
      },
      {
        id: "orders",
        sections: [
          {
            name: "Section 0",
            items: [{ name: "Order Date" }, { name: "Created At" }],
          },
        ],
      },
    ]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterDisplayGroupsBySearch(groups, "zzzzz")).toEqual([]);
  });

  it("filters out groups with no matching sections", () => {
    expect(filterDisplayGroupsBySearch(groups, "region")).toEqual([
      {
        id: "revenue",
        sections: [{ name: "Section 1", items: [{ name: "Region" }] }],
      },
    ]);
  });

  it("filters out sections with no matching items", () => {
    expect(filterDisplayGroupsBySearch(groups, "order date")).toEqual([
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Order Date" }] }],
      },
    ]);
  });

  it("matches segment-like items that live inside a section", () => {
    // With segments merged into section.items, a section can contain both
    // dimensions and segments — search should treat them uniformly.
    const groupsWithMergedSegments: TestGroup[] = [
      {
        id: "revenue",
        sections: [
          {
            name: "Source",
            items: [{ name: "Active customers" }, { name: "Created At" }],
          },
        ],
      },
    ];
    expect(
      filterDisplayGroupsBySearch(groupsWithMergedSegments, "active"),
    ).toEqual([
      {
        id: "revenue",
        sections: [{ name: "Source", items: [{ name: "Active customers" }] }],
      },
    ]);
  });
});

describe("getMetricGroups", () => {
  it("places segments above dimensions in a single unnamed section", () => {
    const source = makeDefinitionSource(0);
    // Unjustified type cast. FIXME
    const dim = {
      __dim: "createdAt",
    } as unknown as LibMetric.DimensionMetadata;
    // Unjustified type cast. FIXME
    const seg = {
      __seg: "active",
    } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([dim]);
    mockLibMetric.availableSegments.mockReturnValue([seg]);
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === dim) {
          return getDimensionInfo("Created At", {
            id: "main",
            displayName: "Orders",
            type: "main",
          });
        }
        if (target === seg) {
          return getSegmentInfo("Active customers");
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const [group] = getMetricGroups([source], {});

    expect(group.hasSegments).toBe(true);
    expect(group.sections).toHaveLength(1);
    expect(group.sections[0]).not.toHaveProperty("name");
    expect(group.sections[0].items).toEqual([
      expect.objectContaining({ name: "Active customers", segment: seg }),
      expect.objectContaining({ name: "Created At", definitionIndex: 0 }),
    ]);
  });

  it("emits empty sections when neither dimensions nor segments exist", () => {
    const source = makeDefinitionSource(0);
    mockLibMetric.filterableDimensions.mockReturnValue([]);
    mockLibMetric.availableSegments.mockReturnValue([]);

    const [group] = getMetricGroups([source], {});
    expect(group.hasSegments).toBe(false);
    expect(group.sections).toEqual([]);
  });

  it("shows segments when there are no filterable dimensions", () => {
    const source = makeDefinitionSource(0);
    // Unjustified type cast. FIXME
    const seg = { __seg: "big" } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([]);
    mockLibMetric.availableSegments.mockReturnValue([seg]);
    mockLibMetric.displayInfo.mockReturnValue(getSegmentInfo("Big orders"));

    const [group] = getMetricGroups([source], {});
    expect(group.hasSegments).toBe(true);
    expect(group.sections).toHaveLength(1);
    expect(group.sections[0]).not.toHaveProperty("name");
    expect(group.sections[0].items).toEqual([
      expect.objectContaining({ name: "Big orders", segment: seg }),
    ]);
  });

  it("flattens dimensions across table groups in filterable order", () => {
    const source = makeDefinitionSource(0);
    // Unjustified type cast. FIXME
    const mainDimMeta = {
      __dim: "createdAt",
    } as unknown as LibMetric.DimensionMetadata;
    // Unjustified type cast. FIXME
    const connDimMeta = {
      __dim: "productCategory",
    } as unknown as LibMetric.DimensionMetadata;
    // Unjustified type cast. FIXME
    const seg = {
      __seg: "active",
    } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([
      mainDimMeta,
      connDimMeta,
    ]);
    mockLibMetric.availableSegments.mockReturnValue([seg]);
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === mainDimMeta) {
          return getDimensionInfo("Created At", {
            id: "main",
            displayName: "Orders",
            type: "main",
          });
        }
        if (target === connDimMeta) {
          return getDimensionInfo("Category", {
            id: "conn",
            displayName: "Products",
            type: "connection",
          });
        }
        if (target === seg) {
          return getSegmentInfo("Active customers");
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const [group] = getMetricGroups([source], {});
    expect(group.sections).toHaveLength(1);
    expect(group.sections[0]).not.toHaveProperty("name");
    expect(group.sections[0].items).toEqual([
      expect.objectContaining({ name: "Active customers", segment: seg }),
      expect.objectContaining({ name: "Created At" }),
      expect.objectContaining({ name: "Category" }),
    ]);
  });

  it("scopes segments per definition source index", () => {
    const source0 = makeDefinitionSource(0);
    const source1 = makeDefinitionSource(1);
    // Unjustified type cast. FIXME
    const segA = { __seg: "a" } as unknown as LibMetric.SegmentMetadata;
    // Unjustified type cast. FIXME
    const segB = { __seg: "b" } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([]);
    mockLibMetric.availableSegments.mockImplementation((def: unknown) => {
      // Unjustified type cast. FIXME
      if ((def as { __fakeDefinition: number }).__fakeDefinition === 0) {
        return [segA];
      }
      return [segB];
    });
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === segA) {
          return getSegmentInfo("Seg A");
        }
        if (target === segB) {
          return getSegmentInfo("Seg B");
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const groups = getMetricGroups([source0, source1], {});
    expect(groups[0].sections[0].items).toEqual([
      expect.objectContaining({
        name: "Seg A",
        definitionIndex: 0,
        segment: segA,
      }),
    ]);
    expect(groups[1].sections[0].items).toEqual([
      expect.objectContaining({
        name: "Seg B",
        definitionIndex: 1,
        segment: segB,
      }),
    ]);
  });
});

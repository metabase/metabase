import type { DefinitionSource } from "metabase/metrics-viewer/utils/definition-sources";
import type * as LibMetric from "metabase-lib/metric";
import * as LibMetricModule from "metabase-lib/metric";

import { getMetricGroups } from "./utils";

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

const mockLibMetric = LibMetricModule as jest.Mocked<typeof LibMetric>;

function makeDefinitionSource(
  index: number,
  overrides: Partial<DefinitionSource> = {},
): DefinitionSource {
  return {
    index,
    id: `src-${index}` as DefinitionSource["id"],
    definition: {
      __fakeDefinition: index,
    } as unknown as LibMetric.MetricDefinition,
    entity: {} as DefinitionSource["entity"],
    entityIndex: index,
    token: undefined,
    ...overrides,
  };
}

const DIMENSION_DISPLAY = {
  createdAt: {
    displayName: "Created At",
    group: { id: "g1", displayName: "Orders" },
  },
  category: {
    displayName: "Category",
    group: { id: "g1", displayName: "Orders" },
  },
};

const SEGMENT_DISPLAY = {
  active: { displayName: "Active customers" },
  big: { displayName: "Big orders" },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("getMetricGroups", () => {
  it("returns a group with no segments when availableSegments is empty", () => {
    const source = makeDefinitionSource(0);
    const dimCreatedAt = {
      __dim: "createdAt",
    } as unknown as LibMetric.DimensionMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([dimCreatedAt]);
    mockLibMetric.availableSegments.mockReturnValue([]);
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === dimCreatedAt) {
          return DIMENSION_DISPLAY.createdAt as ReturnType<
            typeof LibMetric.displayInfo
          >;
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const groups = getMetricGroups([source], {});
    expect(groups).toHaveLength(1);
    expect(groups[0].segments).toEqual([]);
    expect(groups[0].sections).toHaveLength(1);
    expect(groups[0].sections[0].items).toEqual([
      expect.objectContaining({ name: "Created At", definitionIndex: 0 }),
    ]);
  });

  it("includes available segments with their display names", () => {
    const source = makeDefinitionSource(0);
    const segmentActive = {
      __seg: "active",
    } as unknown as LibMetric.SegmentMetadata;
    const segmentBig = { __seg: "big" } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([]);
    mockLibMetric.availableSegments.mockReturnValue([
      segmentActive,
      segmentBig,
    ]);
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === segmentActive) {
          return SEGMENT_DISPLAY.active as ReturnType<
            typeof LibMetric.displayInfo
          >;
        }
        if (target === segmentBig) {
          return SEGMENT_DISPLAY.big as ReturnType<
            typeof LibMetric.displayInfo
          >;
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const groups = getMetricGroups([source], {});
    expect(groups).toHaveLength(1);
    expect(groups[0].segments).toEqual([
      expect.objectContaining({
        name: "Active customers",
        definitionIndex: 0,
        segment: segmentActive,
      }),
      expect.objectContaining({
        name: "Big orders",
        definitionIndex: 0,
        segment: segmentBig,
      }),
    ]);
  });

  it("scopes segments per definition source index", () => {
    const source0 = makeDefinitionSource(0);
    const source1 = makeDefinitionSource(1);
    const segA = { __seg: "a" } as unknown as LibMetric.SegmentMetadata;
    const segB = { __seg: "b" } as unknown as LibMetric.SegmentMetadata;

    mockLibMetric.filterableDimensions.mockReturnValue([]);
    mockLibMetric.availableSegments.mockImplementation((def: unknown) => {
      if ((def as { __fakeDefinition: number }).__fakeDefinition === 0) {
        return [segA];
      }
      return [segB];
    });
    mockLibMetric.displayInfo.mockImplementation(
      (_def: unknown, target: unknown) => {
        if (target === segA) {
          return { displayName: "Seg A" } as ReturnType<
            typeof LibMetric.displayInfo
          >;
        }
        if (target === segB) {
          return { displayName: "Seg B" } as ReturnType<
            typeof LibMetric.displayInfo
          >;
        }
        throw new Error("unexpected displayInfo target");
      },
    );

    const groups = getMetricGroups([source0, source1], {});
    expect(groups[0].segments).toEqual([
      expect.objectContaining({
        name: "Seg A",
        definitionIndex: 0,
        segment: segA,
      }),
    ]);
    expect(groups[1].segments).toEqual([
      expect.objectContaining({
        name: "Seg B",
        definitionIndex: 1,
        segment: segB,
      }),
    ]);
  });
});

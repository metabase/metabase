import { createMockMetadata } from "__support__/metadata";
import {
  TOTAL_MEASURE,
  setupMeasureDefinition,
} from "metabase/metrics-viewer/utils/__tests__/test-helpers";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type { MeasureId } from "metabase-types/api";
import { createMockSegment } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks/query";

import type { CubeCard, CubeCatalog, CubeFilters } from "../types";

import {
  EMPTY_PROJECTION_CONFIG,
  cardToViewerModel,
} from "./card-viewer-model";

const CREATED_AT_KEY = `field:${ORDERS.CREATED_AT}`;
const QUANTITY_KEY = `field:${ORDERS.QUANTITY}`;
const MISSING_KEY = "field:99999";

const ENTERPRISE_SEGMENT = createMockSegment({
  id: 7,
  name: "Enterprise",
  table_id: ORDERS_ID,
  definition: createMockStructuredDatasetQuery({
    query: {
      "source-table": ORDERS_ID,
      filter: [">", ["field", ORDERS.QUANTITY, null], 10],
    },
  }),
});

const LEGACY_SEGMENT = createMockSegment({
  id: 8,
  name: "Legacy plan",
  table_id: ORDERS_ID,
  definition: createMockStructuredDatasetQuery({
    query: {
      "source-table": ORDERS_ID,
      filter: ["<", ["field", ORDERS.QUANTITY, null], 2],
    },
  }),
});

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
  measures: [TOTAL_MEASURE],
  segments: [ENTERPRISE_SEGMENT, LEGACY_SEGMENT],
});

const CATALOG: CubeCatalog = {
  tableId: ORDERS_ID,
  measures: [
    {
      id: TOTAL_MEASURE.id,
      name: TOTAL_MEASURE.name,
      isAdditive: true,
      dimensionIds: {
        [CREATED_AT_KEY]: "measure-dim-created-at",
        [QUANTITY_KEY]: "measure-dim-quantity",
      },
    },
  ],
  dimensions: [
    {
      key: CREATED_AT_KEY,
      label: "Created At",
      type: "time",
      score: 0.8,
      distinctCount: null,
      canListValues: false,
    },
    {
      key: QUANTITY_KEY,
      label: "Quantity",
      type: "numeric",
      score: 0.3,
      distinctCount: 50,
      canListValues: false,
    },
  ],
  segments: [
    { id: ENTERPRISE_SEGMENT.id, name: ENTERPRISE_SEGMENT.name },
    { id: LEGACY_SEGMENT.id, name: LEGACY_SEGMENT.name },
  ],
};

const NO_FILTERS: CubeFilters = { segmentIds: [], dimensionFilters: [] };

function setup({
  card,
  filters = NO_FILTERS,
  definitions = new Map<MeasureId, MetricDefinition>([
    [TOTAL_MEASURE.id, setupMeasureDefinition(metadata, TOTAL_MEASURE.id)],
  ]),
}: {
  card: CubeCard;
  filters?: CubeFilters;
  definitions?: Map<MeasureId, MetricDefinition>;
}) {
  return cardToViewerModel({ card, catalog: CATALOG, definitions, filters });
}

function segmentFilterCount(definition: MetricDefinition | null): number {
  if (!definition) {
    return 0;
  }
  return LibMetric.filters(definition).filter((clause) =>
    LibMetric.isSegmentFilter(clause),
  ).length;
}

const SINGLE_CARD: CubeCard = {
  id: "single:m100:field:1",
  kind: "single",
  series: [{ measureId: TOTAL_MEASURE.id, segmentIds: [] }],
  dimensionKeys: [CREATED_AT_KEY],
  display: "line",
};

const OVERVIEW_CARD: CubeCard = {
  id: "overview:m100",
  kind: "overview",
  series: [{ measureId: TOTAL_MEASURE.id, segmentIds: [] }],
  dimensionKeys: [],
  display: "scalar",
};

const BY_SEGMENT_CARD: CubeCard = {
  id: "by-segment:m100",
  kind: "by-segment",
  series: [
    { measureId: TOTAL_MEASURE.id, segmentIds: [] },
    { measureId: TOTAL_MEASURE.id, segmentIds: [ENTERPRISE_SEGMENT.id] },
    { measureId: TOTAL_MEASURE.id, segmentIds: [LEGACY_SEGMENT.id] },
  ],
  dimensionKeys: [],
  display: "scalar",
};

describe("cardToViewerModel", () => {
  it("returns null when a measure has no definition", () => {
    expect(setup({ card: SINGLE_CARD, definitions: new Map() })).toBeNull();
  });

  it("returns null when a measure is not in the catalog", () => {
    const card: CubeCard = {
      ...SINGLE_CARD,
      series: [{ measureId: 12345, segmentIds: [] }],
    };
    expect(setup({ card })).toBeNull();
  });

  it("builds one pristine definition per distinct measure and one entity per series", () => {
    const model = setup({ card: BY_SEGMENT_CARD });

    expect(model).not.toBeNull();
    expect(Object.keys(model?.definitions ?? {})).toEqual([
      `measure:${TOTAL_MEASURE.id}`,
    ]);
    expect(model?.formulaEntities).toHaveLength(3);
    expect(model?.formulaEntities.map((entity) => entity.id)).toEqual(
      Array(3).fill(`measure:${TOTAL_MEASURE.id}`),
    );
    expect(
      segmentFilterCount(
        model?.definitions[`measure:${TOTAL_MEASURE.id}`].definition ?? null,
      ),
    ).toBe(0);
  });

  describe("segments", () => {
    it("applies series segments to that series' definition", () => {
      const model = setup({ card: BY_SEGMENT_CARD });
      const counts = model?.formulaEntities.map((entity) =>
        segmentFilterCount(entity.definition),
      );
      expect(counts).toEqual([0, 1, 1]);
    });

    it("applies filter-bar segments to every series and deduplicates them", () => {
      const model = setup({
        card: BY_SEGMENT_CARD,
        filters: { segmentIds: [ENTERPRISE_SEGMENT.id], dimensionFilters: [] },
      });
      const counts = model?.formulaEntities.map((entity) =>
        segmentFilterCount(entity.definition),
      );
      expect(counts).toEqual([1, 1, 2]);
    });

    it("skips segment ids that are not available on the definition", () => {
      const model = setup({
        card: SINGLE_CARD,
        filters: { segmentIds: [4242], dimensionFilters: [] },
      });
      expect(
        segmentFilterCount(model?.formulaEntities[0].definition ?? null),
      ).toBe(0);
    });
  });

  describe("dimension filters", () => {
    const quantityFilter: CubeFilters = {
      segmentIds: [],
      dimensionFilters: [
        {
          dimensionKey: QUANTITY_KEY,
          value: { type: "number", operator: ">", values: [5] },
        },
      ],
    };

    it("applies a filter when the measure has the dimension", () => {
      const model = setup({ card: SINGLE_CARD, filters: quantityFilter });
      const definition = model?.formulaEntities[0].definition ?? null;
      expect(definition && LibMetric.filters(definition)).toHaveLength(1);
      expect(model?.unappliedFilterMeasureIds).toEqual([]);
    });

    it("skips a filter when the measure does not have the dimension", () => {
      const model = setup({
        card: SINGLE_CARD,
        filters: {
          segmentIds: [],
          dimensionFilters: [
            {
              dimensionKey: MISSING_KEY,
              value: { type: "number", operator: ">", values: [5] },
            },
          ],
        },
      });
      const definition = model?.formulaEntities[0].definition ?? null;
      expect(definition && LibMetric.filters(definition)).toHaveLength(0);
      expect(model?.unappliedFilterMeasureIds).toEqual([TOTAL_MEASURE.id]);
    });

    it("skips a filter when the dimension id does not resolve", () => {
      const catalogWithBadId: CubeCatalog = {
        ...CATALOG,
        measures: [
          {
            ...CATALOG.measures[0],
            dimensionIds: { [QUANTITY_KEY]: "does-not-exist" },
          },
        ],
      };
      const model = cardToViewerModel({
        card: SINGLE_CARD,
        catalog: catalogWithBadId,
        definitions: new Map([
          [
            TOTAL_MEASURE.id,
            setupMeasureDefinition(metadata, TOTAL_MEASURE.id),
          ],
        ]),
        filters: quantityFilter,
      });
      expect(model?.unappliedFilterMeasureIds).toEqual([TOTAL_MEASURE.id]);
    });
  });

  describe("dimensions", () => {
    it("maps the x-axis dimension by slot index and leaves the entity unprojected", () => {
      const model = setup({ card: SINGLE_CARD });

      expect(model?.dimensionBreakout).toEqual({
        id: SINGLE_CARD.id,
        type: "time",
        label: null,
        display: "line",
        dimensionMapping: { 0: "measure-dim-created-at" },
        projectionConfig: EMPTY_PROJECTION_CONFIG,
      });
      expect(model?.dimensionBreakout.projectionConfig).toBe(
        EMPTY_PROJECTION_CONFIG,
      );
      const definition = model?.formulaEntities[0].definition ?? null;
      expect(definition && LibMetric.projections(definition)).toHaveLength(0);
    });

    it("puts the second dimension on the entity as a breakout projection", () => {
      const card: CubeCard = {
        ...SINGLE_CARD,
        kind: "time-by-category",
        dimensionKeys: [CREATED_AT_KEY, QUANTITY_KEY],
      };
      const model = setup({ card });

      expect(model?.dimensionBreakout.dimensionMapping).toEqual({
        0: "measure-dim-created-at",
      });
      const definition = model?.formulaEntities[0].definition ?? null;
      expect(definition && LibMetric.projections(definition)).toHaveLength(1);
    });

    it("uses a scalar breakout with an empty mapping when the card has no dimension", () => {
      const model = setup({ card: OVERVIEW_CARD });

      expect(model?.dimensionBreakout.type).toBe("scalar");
      expect(model?.dimensionBreakout.dimensionMapping).toEqual({});
    });

    it("maps null when a measure lacks the x-axis dimension", () => {
      const card: CubeCard = { ...SINGLE_CARD, dimensionKeys: [MISSING_KEY] };
      const model = setup({ card });

      expect(model?.dimensionBreakout.type).toBe("scalar");
      expect(model?.dimensionBreakout.dimensionMapping).toEqual({ 0: null });
    });
  });

  describe("entity names", () => {
    it("labels by-segment series 'All' and by segment name", () => {
      const model = setup({ card: BY_SEGMENT_CARD });
      expect([...(model?.entityNames.values() ?? [])]).toEqual([
        "All",
        "Enterprise",
        "Legacy plan",
      ]);
    });

    it("labels other cards by measure name, with segment names in parentheses", () => {
      const card: CubeCard = {
        id: "segment-vs-total:m100+m100|s7:field:1",
        kind: "segment-vs-total",
        series: [
          { measureId: TOTAL_MEASURE.id, segmentIds: [] },
          { measureId: TOTAL_MEASURE.id, segmentIds: [ENTERPRISE_SEGMENT.id] },
        ],
        dimensionKeys: [CREATED_AT_KEY],
        display: "line",
      };
      const model = setup({ card });
      expect([...(model?.entityNames.values() ?? [])]).toEqual([
        TOTAL_MEASURE.name,
        `${TOTAL_MEASURE.name} (Enterprise)`,
      ]);
    });
  });
});

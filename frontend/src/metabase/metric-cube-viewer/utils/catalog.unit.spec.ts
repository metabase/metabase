import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import type { MetricDefinition } from "metabase-lib/metric";
import * as LibMetric from "metabase-lib/metric";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  Field,
  Measure,
  MeasureId,
  Table,
  TestAggregationSpec,
} from "metabase-types/api";
import {
  createMockMeasure,
  createMockMetricDimension,
  createMockMetricDimensionGroup,
  createMockSegment,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { buildCubeCatalog, getMeasureAggregationInfo } from "./catalog";

const SUM_TOTAL_ID = 100;
const COUNT_ID = 101;
const AVG_TOTAL_ID = 102;
const CUSTOM_ID = 103;

const CREATED_AT_KEY = `field:${ORDERS.CREATED_AT}`;
const QUANTITY_KEY = `field:${ORDERS.QUANTITY}`;
const TOTAL_KEY = `field:${ORDERS.TOTAL}`;

function setupMeasureDefinition(
  metadata: Metadata,
  measureId: MeasureId,
): MetricDefinition {
  const provider = LibMetric.metadataProvider(metadata);
  const measureMetadata = LibMetric.measureMetadata(provider, measureId);
  if (!measureMetadata) {
    throw new Error(`Measure ${measureId} not found`);
  }
  return LibMetric.fromMeasureMetadata(provider, measureMetadata);
}

function createSampleMetadata(measures: Measure[]): Metadata {
  return createMockMetadata({
    databases: [
      createSampleDatabase({
        tables: [
          createOrdersTable(),
          createPeopleTable(),
          createProductsTable(),
          createReviewsTable(),
        ],
      }),
    ],
    measures,
  });
}

const totalColumn = {
  type: "column",
  name: "TOTAL",
  sourceName: "ORDERS",
} as const;

function createOrdersMeasure(
  id: MeasureId,
  name: string,
  aggregation: TestAggregationSpec,
  dimensions: Measure["dimensions"],
): Measure {
  const baseMetadata = createSampleMetadata([]);
  return createMockMeasure({
    id,
    name,
    table_id: ORDERS_ID,
    definition: Lib.toJsQuery(
      Lib.createTestQuery(Lib.metadataProvider(SAMPLE_DB_ID, baseMetadata), {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            aggregations: [aggregation],
          },
        ],
      }),
    ),
    dimensions,
    dimension_mappings: [],
  });
}

const createdAtDimension = (id: string) =>
  createMockMetricDimension({
    id,
    display_name: "Created At",
    effective_type: "type/DateTime",
    semantic_type: "type/CreationTimestamp",
    sources: [{ type: "field", "field-id": ORDERS.CREATED_AT }],
  });

const quantityDimension = (id: string) =>
  createMockMetricDimension({
    id,
    display_name: "Quantity",
    effective_type: "type/Integer",
    semantic_type: "type/Category",
    has_field_values: "list",
    sources: [{ type: "field", "field-id": ORDERS.QUANTITY }],
  });

const totalDimension = (id: string) =>
  createMockMetricDimension({
    id,
    display_name: "Total",
    effective_type: "type/Float",
    semantic_type: "type/Currency",
    sources: [{ type: "field", "field-id": ORDERS.TOTAL }],
  });

const SUM_TOTAL = createOrdersMeasure(
  SUM_TOTAL_ID,
  "Sum of Total",
  { type: "operator", operator: "sum", args: [totalColumn] },
  [
    createdAtDimension("sum-created-at"),
    quantityDimension("sum-quantity"),
    totalDimension("sum-total"),
    createMockMetricDimension({
      id: "sum-no-source",
      display_name: "No Source",
      effective_type: "type/Text",
      semantic_type: "type/Category",
    }),
    createMockMetricDimension({
      id: "sum-joined-category",
      display_name: "Product Category",
      effective_type: "type/Text",
      semantic_type: "type/Category",
      group: createMockMetricDimensionGroup({
        id: "products",
        type: "connection",
        display_name: "Products",
      }),
      sources: [{ type: "field", "field-id": 999 }],
    }),
  ],
);

const COUNT = createOrdersMeasure(
  COUNT_ID,
  "Count",
  { type: "operator", operator: "count" },
  [
    createdAtDimension("count-created-at"),
    quantityDimension("count-quantity"),
    totalDimension("count-total"),
  ],
);

const AVG_TOTAL = createOrdersMeasure(
  AVG_TOTAL_ID,
  "Average Total",
  { type: "operator", operator: "avg", args: [totalColumn] },
  [createdAtDimension("avg-created-at")],
);

const CUSTOM = createOrdersMeasure(
  CUSTOM_ID,
  "Custom",
  {
    type: "operator",
    operator: "+",
    args: [
      { type: "operator", operator: "sum", args: [totalColumn] },
      { type: "literal", value: 1 },
    ],
  },
  [createdAtDimension("custom-created-at")],
);

const ALL_MEASURES = [SUM_TOTAL, COUNT, AVG_TOTAL, CUSTOM];

function setup({
  measures = ALL_MEASURES,
  table = createOrdersTable(),
}: { measures?: Measure[]; table?: Table } = {}) {
  const metadata = createSampleMetadata(measures);
  const definitions = new Map<MeasureId, MetricDefinition>(
    measures.map((measure) => [
      measure.id,
      setupMeasureDefinition(metadata, measure.id),
    ]),
  );
  return buildCubeCatalog({
    tableId: ORDERS_ID,
    table,
    measures,
    definitions,
    metadata,
  });
}

function withFieldOverrides(
  overrides: Partial<Record<number, Partial<Field>>>,
): Table {
  const table = createOrdersTable();
  return {
    ...table,
    fields: (table.fields ?? []).map((field) => ({
      ...field,
      ...(typeof field.id === "number" ? overrides[field.id] : undefined),
    })),
  };
}

describe("buildCubeCatalog", () => {
  it("groups dimensions across measures by field id and keeps each measure's own dimension id", () => {
    const catalog = setup({ measures: [SUM_TOTAL, COUNT] });

    expect(catalog.tableId).toBe(ORDERS_ID);
    expect(catalog.dimensions.map((dimension) => dimension.key)).toEqual([
      CREATED_AT_KEY,
      QUANTITY_KEY,
      TOTAL_KEY,
    ]);

    const [count, sumTotal] = catalog.measures;
    expect(count.name).toBe("Count");
    expect(count.dimensionIds).toEqual({
      [CREATED_AT_KEY]: "count-created-at",
      [QUANTITY_KEY]: "count-quantity",
      [TOTAL_KEY]: "count-total",
    });
    expect(sumTotal.name).toBe("Sum of Total");
    expect(sumTotal.dimensionIds[CREATED_AT_KEY]).toBe("sum-created-at");
    expect(sumTotal.dimensionIds[QUANTITY_KEY]).toBe("sum-quantity");
  });

  it("sorts measures by name, dimensions by label, and segments by name", () => {
    const table = createOrdersTable({
      segments: [
        createMockSegment({ id: 2, name: "Large orders", table_id: ORDERS_ID }),
        createMockSegment({ id: 1, name: "Discounted", table_id: ORDERS_ID }),
      ],
    });
    const catalog = setup({ table });

    expect(catalog.measures.map((measure) => measure.name)).toEqual([
      "Average Total",
      "Count",
      "Custom",
      "Sum of Total",
    ]);
    expect(catalog.dimensions.map((dimension) => dimension.label)).toEqual([
      "Created At",
      "Quantity",
      "Total",
    ]);
    expect(catalog.segments).toEqual([
      { id: 1, name: "Discounted" },
      { id: 2, name: "Large orders" },
    ]);
  });

  it("excludes connection-group dimensions and dimensions without a field id", () => {
    const catalog = setup({ measures: [SUM_TOTAL] });
    const labels = catalog.dimensions.map((dimension) => dimension.label);

    expect(labels).not.toContain("Product Category");
    expect(labels).not.toContain("No Source");
    expect(Object.keys(catalog.measures[0].dimensionIds)).toEqual([
      CREATED_AT_KEY,
      QUANTITY_KEY,
    ]);
  });

  it("excludes the aggregated column from the measure that aggregates it", () => {
    const catalog = setup({ measures: [SUM_TOTAL, COUNT] });
    const sumTotal = catalog.measures.find(
      (measure) => measure.id === SUM_TOTAL_ID,
    );
    const count = catalog.measures.find((measure) => measure.id === COUNT_ID);

    expect(sumTotal?.dimensionIds[TOTAL_KEY]).toBeUndefined();
    expect(count?.dimensionIds[TOTAL_KEY]).toBe("count-total");
  });

  it("skips measures without a definition", () => {
    const metadata = createSampleMetadata(ALL_MEASURES);
    const definitions = new Map<MeasureId, MetricDefinition>([
      [COUNT_ID, setupMeasureDefinition(metadata, COUNT_ID)],
    ]);
    const catalog = buildCubeCatalog({
      tableId: ORDERS_ID,
      table: createOrdersTable(),
      measures: ALL_MEASURES,
      definitions,
      metadata,
    });

    expect(catalog.measures.map((measure) => measure.id)).toEqual([COUNT_ID]);
  });

  it("ignores archived segments", () => {
    const table = createOrdersTable({
      segments: [
        createMockSegment({ id: 1, name: "Active", table_id: ORDERS_ID }),
        createMockSegment({
          id: 2,
          name: "Archived",
          table_id: ORDERS_ID,
          archived: true,
        }),
      ],
    });

    expect(setup({ table }).segments).toEqual([{ id: 1, name: "Active" }]);
  });

  describe("dimension score", () => {
    const findDimension = (catalog: ReturnType<typeof setup>, key: string) => {
      const dimension = catalog.dimensions.find((d) => d.key === key);
      if (!dimension) {
        throw new Error(`Missing dimension ${key}`);
      }
      return dimension;
    };

    it("uses the field's interestingness when present", () => {
      const table = withFieldOverrides({
        [ORDERS.CREATED_AT]: { dimension_interestingness: 0.91 },
        [ORDERS.QUANTITY]: { dimension_interestingness: 0 },
      });
      const catalog = setup({ measures: [COUNT], table });

      expect(findDimension(catalog, CREATED_AT_KEY).score).toBe(0.91);
      expect(findDimension(catalog, QUANTITY_KEY).score).toBe(0);
    });

    it("falls back to the score table when interestingness is null", () => {
      const textDimension = (
        id: string,
        fieldId: number,
        hasFieldValues: "list" | "none",
      ) =>
        createMockMetricDimension({
          id,
          display_name: id,
          effective_type: "type/Text",
          semantic_type: null,
          has_field_values: hasFieldValues,
          sources: [{ type: "field", "field-id": fieldId }],
        });
      const measure = createOrdersMeasure(
        COUNT_ID,
        "Count",
        { type: "operator", operator: "count" },
        [
          createdAtDimension("count-created-at"),
          quantityDimension("count-quantity"),
          totalDimension("count-total"),
          textDimension("listable-text", ORDERS.TAX, "list"),
          textDimension("unlistable-text", ORDERS.SUBTOTAL, "none"),
        ],
      );
      const table = withFieldOverrides({
        [ORDERS.CREATED_AT]: { dimension_interestingness: null },
        [ORDERS.QUANTITY]: { dimension_interestingness: null },
        [ORDERS.TOTAL]: { dimension_interestingness: null },
        [ORDERS.TAX]: { dimension_interestingness: null, fingerprint: null },
        [ORDERS.SUBTOTAL]: {
          dimension_interestingness: null,
          fingerprint: null,
        },
      });
      const catalog = setup({ measures: [measure], table });

      // time + type/CreationTimestamp
      expect(findDimension(catalog, CREATED_AT_KEY).score).toBe(0.8);
      // preferred (type/Category) with listable values
      expect(findDimension(catalog, QUANTITY_KEY).score).toBe(0.6);
      // plain text with listable values
      expect(findDimension(catalog, `field:${ORDERS.TAX}`).score).toBe(0.5);
      // plain text without listable values
      expect(findDimension(catalog, `field:${ORDERS.SUBTOTAL}`).score).toBe(
        0.35,
      );
      // numeric
      expect(findDimension(catalog, TOTAL_KEY).score).toBe(0.3);
    });

    it("scores non-creation time dimensions at 0.6", () => {
      const table = withFieldOverrides({
        [ORDERS.CREATED_AT]: { semantic_type: null },
      });
      const catalog = setup({ measures: [COUNT], table });

      expect(findDimension(catalog, CREATED_AT_KEY).score).toBe(0.6);
    });

    it("halves the score of category dimensions with more than 100 distinct values", () => {
      const table = withFieldOverrides({
        [ORDERS.QUANTITY]: {
          dimension_interestingness: 0.8,
          fingerprint: { global: { "distinct-count": 250 } },
        },
      });
      const catalog = setup({ measures: [COUNT], table });
      const quantity = findDimension(catalog, QUANTITY_KEY);

      expect(quantity.distinctCount).toBe(250);
      expect(quantity.score).toBe(0.4);
    });

    it("does not penalize non-category dimensions for high cardinality", () => {
      const catalog = setup({ measures: [COUNT] });
      const createdAt = findDimension(catalog, CREATED_AT_KEY);

      expect(createdAt.distinctCount).toBe(9998);
      expect(createdAt.score).toBe(0.8);
    });

    it("reads distinct count and listability from the field and descriptor", () => {
      const catalog = setup({ measures: [COUNT] });
      const quantity = findDimension(catalog, QUANTITY_KEY);

      expect(quantity).toEqual({
        key: QUANTITY_KEY,
        label: "Quantity",
        type: "category",
        score: 0.6,
        distinctCount: 62,
        canListValues: true,
      });
    });
  });

  describe("additivity", () => {
    it("marks count and sum as additive, avg and custom expressions as not", () => {
      const catalog = setup();
      const isAdditiveById = new Map(
        catalog.measures.map((measure) => [measure.id, measure.isAdditive]),
      );

      expect(isAdditiveById.get(SUM_TOTAL_ID)).toBe(true);
      expect(isAdditiveById.get(COUNT_ID)).toBe(true);
      expect(isAdditiveById.get(AVG_TOTAL_ID)).toBe(false);
      expect(isAdditiveById.get(CUSTOM_ID)).toBe(false);
    });
  });
});

describe("getMeasureAggregationInfo", () => {
  const metadata = createSampleMetadata(ALL_MEASURES);

  it("finds the aggregated field for column aggregations", () => {
    expect(getMeasureAggregationInfo(metadata, SUM_TOTAL)).toEqual({
      isAdditive: true,
      aggregatedFieldId: ORDERS.TOTAL,
    });
    expect(getMeasureAggregationInfo(metadata, AVG_TOTAL)).toEqual({
      isAdditive: false,
      aggregatedFieldId: ORDERS.TOTAL,
    });
  });

  it("has no aggregated field for count", () => {
    expect(getMeasureAggregationInfo(metadata, COUNT)).toEqual({
      isAdditive: true,
      aggregatedFieldId: null,
    });
  });

  it("treats custom expressions as not additive", () => {
    expect(getMeasureAggregationInfo(metadata, CUSTOM)).toEqual({
      isAdditive: false,
      aggregatedFieldId: null,
    });
  });
});

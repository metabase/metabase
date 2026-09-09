/* istanbul ignore file */

import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  DatasetColumn,
  Field,
  FieldId,
  RowValues,
  TestAggregationSpec,
  TestBreakoutSpec,
  TestColumnSpec,
  TestQuerySpec,
} from "metabase-types/api";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  PEOPLE_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { makeCandidate } from "./candidates";
import { type ShapeContext, summarizeShape } from "./shape";
import type {
  Candidate,
  ColumnMapping,
  ColumnProfile,
  ColumnRole,
  Decision,
  DefaultVizInput,
  NativeItem,
  NativeStructure,
  ProfileInput,
  RowStats,
  ScoredCandidate,
  Shape,
} from "./types";

export const STAGE_INDEX = -1;

export const SAMPLE_FIELDS: Map<FieldId, Field> = new Map(
  (createSampleDatabase().tables ?? [])
    .flatMap((table) => table.fields ?? [])
    .flatMap((field) =>
      typeof field.id === "number" ? [[field.id, field] as const] : [],
    ),
);

export const count: TestAggregationSpec = {
  type: "operator",
  operator: "count",
  args: [],
};

export function aggregate(
  operator: string,
  column: TestColumnSpec,
): TestAggregationSpec {
  return { type: "operator", operator, args: [column] };
}

export function ordersColumn(name: string): TestColumnSpec {
  return { type: "column", name, sourceName: "ORDERS" };
}

export function peopleColumn(name: string): TestColumnSpec {
  return { type: "column", name, sourceName: "PEOPLE" };
}

export function viaFk(name: string, sourceFieldId: FieldId): TestColumnSpec {
  return { type: "column", name, sourceFieldId };
}

type StageOpts = {
  aggregations?: TestAggregationSpec[];
  breakouts?: TestBreakoutSpec[];
};

function tableQuery(
  tableId: number,
  { aggregations, breakouts }: StageOpts,
): Lib.Query {
  const spec: TestQuerySpec = {
    stages: [
      { source: { type: "table", id: tableId }, aggregations, breakouts },
    ],
  };
  return Lib.createTestQuery(SAMPLE_PROVIDER, spec);
}

export function ordersQuery(opts: StageOpts): Lib.Query {
  return tableQuery(ORDERS_ID, opts);
}

export function peopleQuery(opts: StageOpts): Lib.Query {
  return tableQuery(PEOPLE_ID, opts);
}

export function mbqlInput(
  query: Lib.Query,
  extra: Partial<DefaultVizInput> = {},
): DefaultVizInput {
  return {
    query,
    stageIndex: STAGE_INDEX,
    resultCols: [],
    fields: SAMPLE_FIELDS,
    ...extra,
  };
}

export function withRows(
  input: DefaultVizInput,
  rows: RowValues[],
): DefaultVizInput & { rows: RowValues[] } {
  return { ...input, rows };
}

export function nativeColumn(
  name: string,
  baseType: string,
  semanticType: string | null = null,
): DatasetColumn {
  return createMockColumn({
    id: undefined,
    name,
    display_name: name,
    source: "native",
    base_type: baseType,
    effective_type: baseType,
    semantic_type: semanticType,
    table_id: undefined,
  });
}

export function nativeItem(
  name: string,
  overrides: Partial<NativeItem> = {},
): NativeItem {
  return { name, kind: "column", in_group_by: false, ...overrides };
}

export function nativeInput(
  sql: string,
  resultCols: DatasetColumn[],
  native: NativeStructure,
  extra: Partial<DefaultVizInput> = {},
): DefaultVizInput {
  const query = Lib.nativeQuery(SAMPLE_DB_ID, SAMPLE_PROVIDER, sql);
  return { query, stageIndex: STAGE_INDEX, resultCols, native, ...extra };
}

const STATES = ["CA", "TX", "NY", "FL", "WA", "IL", "PA", "OH", "GA", "NC"];

export function stateRows(junkFraction = 0): RowValues[] {
  const total = 50;
  const junkCount = Math.round(total * junkFraction);
  return Array.from({ length: total }, (_, i) => [
    i < junkCount ? `junk-${i}` : STATES[i % STATES.length],
    100 - i,
  ]);
}

export function funnelRows(): RowValues[] {
  return [
    ["open", 1000],
    ["qualified", 640],
    ["proposal", 300],
    ["negotiation", 120],
    ["won", 45],
  ];
}

// Irregular, strictly increasing timestamps: an event log, not a bucketed series.
export function eventLogRows(rowCount = 500): RowValues[] {
  const start = Date.UTC(2024, 0, 1);
  let cursor = start;
  return Array.from({ length: rowCount }, (_, i) => {
    cursor += (1 + ((i * 7919) % 97)) * 60_000;
    return [
      new Date(cursor).toISOString(),
      Math.round(((i * 7919) % 500) + 10),
    ];
  });
}

export function monthlyRows(
  months = 24,
  seriesValues: string[] = [],
): RowValues[] {
  return Array.from({ length: months }, (_, i) => {
    const month = new Date(Date.UTC(2023, i, 1)).toISOString();
    return seriesValues.length === 0
      ? [[month, 100 + i]]
      : seriesValues.map((series) => [month, series, 100 + i]);
  }).flat();
}

type ProfileOverrides = Partial<ColumnProfile> & {
  index: number;
  name: string;
  role: ColumnRole;
};

export function makeProfile(overrides: ProfileOverrides): ColumnProfile {
  return {
    displayName: overrides.name,
    type: "text",
    roleConfidence: 1,
    source: "breakout",
    agg: null,
    unit: null,
    unitKind: null,
    binning: null,
    cardinality: { estimate: null, exact: false, source: "unknown" },
    labelLength: null,
    nilFraction: null,
    numeric: null,
    semantic: null,
    effectiveType: null,
    geo: null,
    remap: null,
    isKey: false,
    isAttribute: false,
    plottable: true,
    interestingness: null,
    topShare: null,
    temporalSpan: null,
    ...overrides,
  };
}

export function countMeasure(index: number, name = "count"): ColumnProfile {
  return makeProfile({
    index,
    name,
    role: "MEASURE",
    type: "number",
    source: "aggregation",
    effectiveType: "type/Integer",
    agg: {
      op: "count",
      argType: "number",
      cumulative: false,
      share: false,
      additive: true,
    },
  });
}

export function avgMeasure(index: number, name = "avg"): ColumnProfile {
  return makeProfile({
    index,
    name,
    role: "MEASURE",
    type: "number",
    source: "aggregation",
    effectiveType: "type/Float",
    agg: {
      op: "avg",
      argType: "number",
      cumulative: false,
      share: false,
      additive: false,
    },
  });
}

export function categoryDim(
  index: number,
  name: string,
  cardinality: number,
): ColumnProfile {
  return makeProfile({
    index,
    name,
    role: "DIM_CATEGORY",
    type: "text",
    effectiveType: "type/Text",
    cardinality: { estimate: cardinality, exact: false, source: "fingerprint" },
  });
}

export function timeDim(
  index: number,
  name: string,
  unit: ColumnProfile["unit"] = "month",
): ColumnProfile {
  return makeProfile({
    index,
    name,
    role: "DIM_TIME",
    type: "temporal",
    effectiveType: "type/DateTime",
    unit,
    unitKind: "truncation",
    cardinality: { estimate: 24, exact: false, source: "time-span" },
  });
}

export const AGGREGATED_CONTEXT: ShapeContext = {
  isNative: false,
  aggregated: true,
  rowCount: null,
  rowCountExact: false,
};

export function makeShape(
  profiles: ColumnProfile[],
  ctx: Partial<ShapeContext> = {},
): Shape {
  return summarizeShape(profiles, { ...AGGREGATED_CONTEXT, ...ctx });
}

export function makeInput(overrides: Partial<ProfileInput> = {}): ProfileInput {
  return {
    index: 0,
    name: "column",
    displayName: "Column",
    datasetCol: null,
    libCol: null,
    info: null,
    field: null,
    nativeItem: null,
    hasFieldValues: null,
    fingerprint: null,
    source: "fields",
    agg: null,
    unit: null,
    unitKind: null,
    binning: null,
    effectiveType: "type/Text",
    baseType: "type/Text",
    semantic: null,
    visibilityType: "normal",
    previewDisplay: true,
    databaseIsPk: false,
    databaseIsAutoIncrement: false,
    fkTargetFieldId: null,
    remappedFrom: null,
    remappedTo: null,
    interestingness: null,
    ...overrides,
  };
}

export function scored(
  candidate: Candidate,
  score: number,
  feasible = true,
): ScoredCandidate {
  return {
    ...candidate,
    feasible,
    hardFailures: feasible ? [] : [{ id: "n-must-exceed-1", detail: "test" }],
    penalties: [],
    score: feasible ? score : Infinity,
  };
}

type DecisionOpts = {
  chosen: ScoredCandidate;
  candidates?: ScoredCandidate[];
  profiles: ColumnProfile[];
  shape: Shape;
  settings?: Decision["settings"];
  provisional?: boolean;
  confidence?: number;
  stage?: 1 | 2;
};

export function makeDecision({
  chosen,
  candidates = [chosen],
  profiles,
  shape,
  settings = {},
  provisional = false,
  confidence = 1,
  stage = 1,
}: DecisionOpts): Decision {
  return {
    display: chosen.display,
    variant: chosen.variant,
    settings,
    columnMapping: {},
    confidence,
    provisional,
    provisionalReasons: provisional ? ["cardinality-estimated"] : [],
    alternatives: [],
    suggestedOrderBy: null,
    trace: {
      stage,
      profiles,
      shape,
      candidates,
      chosenId: chosen.id,
      rowStats: null,
      ruleFactor: 1,
      reconcile: null,
      warnings: [],
      timings: {
        profileMs: 0,
        shapeMs: 0,
        enumerateMs: 0,
        scoreMs: 0,
        settingsMs: 0,
        totalMs: 0,
      },
    },
  };
}

export function candidate(
  display: Candidate["display"],
  variant: Candidate["variant"],
  mapping: ColumnMapping,
): Candidate {
  return makeCandidate(display, variant, mapping);
}

export function makeRowStats(overrides: Partial<RowStats> = {}): RowStats {
  return {
    rowCount: 0,
    scanned: 0,
    truncated: false,
    distinct: {},
    groupedKeyUnique: null,
    topShare: {},
    pieSlices: {},
    regionMatch: {},
    labelLength: {},
    allNonNeg: {},
    timeSeries: {},
    numericX: {},
    correlation: {},
    kendallTau: {},
    nonIncreasing: {},
    nullCategoryMetricShare: {},
    flat: { allYEqual: false, singleX: false },
    logCandidate: {},
    ...overrides,
  };
}

import type * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  DatasetColumn,
  DatetimeUnit,
  Field,
  FieldFingerprint,
  FieldId,
  FieldValuesType,
  FieldVisibilityType,
  RowValues,
  VisualizationSettings,
} from "metabase-types/api";

export type ColumnType =
  | "temporal"
  | "number"
  | "boolean"
  | "text"
  | "textlike"
  | "structured"
  | "other";

export type ColumnRole =
  | "MEASURE"
  | "DIM_TIME"
  | "DIM_CYCLIC"
  | "DIM_BINNED"
  | "DIM_CATEGORY"
  | "DIM_ORDINAL_NUM"
  | "DIM_NUMERIC"
  | "DIM_GEO_LATLON"
  | "DIM_GEO_REGION"
  | "KEY"
  | "ATTRIBUTE"
  | "UNKNOWN";

export type ColumnSource =
  | "aggregation"
  | "breakout"
  | "fields"
  | "native"
  | "expression"
  | "unknown";

export type AggOp =
  | "count"
  | "cum-count"
  | "distinct"
  | "count-where"
  | "distinct-where"
  | "avg"
  | "share"
  | "stddev"
  | "var"
  | "sum"
  | "cum-sum"
  | "sum-where"
  | "min"
  | "max"
  | "median"
  | "percentile"
  | "unknown";

export type AggInfo = {
  op: AggOp;
  argType: ColumnType;
  cumulative: boolean;
  share: boolean;
  additive: boolean;
};

export type CardinalitySource =
  | "rows"
  | "fingerprint"
  | "time-span"
  | "binning"
  | "remap"
  | "schema"
  | "unknown";

export type Cardinality = {
  estimate: number | null;
  exact: boolean;
  source: CardinalitySource;
};

export type NumericStats = {
  min?: number;
  max?: number;
  q1?: number;
  q3?: number;
  avg?: number;
  sd?: number;
  skew?: number;
  zeroFrac?: number;
  allNonNeg?: boolean;
  includesZero?: boolean;
};

export type RegionType = "us_states" | "world_countries";

export type GeoInfo = {
  kind: "state" | "country" | "lat" | "lon";
  region?: RegionType;
  regionMatch?: number;
};

export type NormalizedFingerprint = {
  distinctCount?: number;
  nilFraction?: number;
  number?: NumericStats & { modeFraction?: number; top3Fraction?: number };
  text?: {
    averageLength?: number;
    percentJson?: number;
    percentUrl?: number;
    percentEmail?: number;
    percentState?: number;
    percentBlank?: number;
    modeFraction?: number;
    top3Fraction?: number;
  };
  temporal?: {
    earliest?: string;
    latest?: string;
    modeFraction?: number;
    top3Fraction?: number;
  };
};

export type ColumnProfile = {
  name: string;
  displayName: string;
  index: number;
  type: ColumnType;
  role: ColumnRole;
  roleConfidence: number;
  altRole?: ColumnRole;
  source: ColumnSource;
  agg: AggInfo | null;
  unit: DatetimeUnit | null;
  unitKind: "truncation" | "extraction" | null;
  binning: {
    strategy: string;
    binWidth?: number;
    numBins?: number;
    min?: number;
    max?: number;
  } | null;
  cardinality: Cardinality;
  labelLength: number | null;
  nilFraction: number | null;
  numeric: NumericStats | null;
  semantic: string | null;
  effectiveType: string | null;
  geo: GeoInfo | null;
  remap: {
    from?: string;
    to?: string;
    fkTargetFieldId?: FieldId | null;
  } | null;
  isKey: boolean;
  isAttribute: boolean;
  plottable: boolean;
  interestingness: number | null;
  topShare: number | null;
  temporalSpan: { earliest: string; latest: string } | null;
};

export type Shape = {
  M: ColumnProfile[];
  Dt: ColumnProfile[];
  Dcyc: ColumnProfile[];
  Dbin: ColumnProfile[];
  Dcat: ColumnProfile[];
  Dnum: ColumnProfile[];
  Glatlon: ColumnProfile[];
  Gregion: ColumnProfile[];
  K: ColumnProfile[];
  A: ColumnProfile[];
  D: ColumnProfile[];
  N: number | null;
  nExact: boolean;
  aggregated: boolean;
  isNative: boolean;
  allColsAggOrBreakout: boolean;
  colCount: number;
  primaryTime: ColumnProfile | null;
  sameScaleMeasures: boolean;
  allAdditive: boolean;
  allNonNeg: boolean;
  allShare: boolean;
};

export type Channel =
  | "x"
  | "series"
  | "metrics"
  | "bubble"
  | "lat"
  | "lon"
  | "region"
  | "source"
  | "target"
  | "value"
  | "pivotRows"
  | "pivotColumns"
  | "scalarField"
  | "grouping"
  | "subGrouping";

export type ColumnMapping = Partial<Record<Channel, number[]>>;

export type DisplayVariant =
  | "stacked"
  | "normalized"
  | "grouped"
  | "histogram"
  | "ordinal"
  | "timeseries"
  | "linear"
  | "region"
  | "pin"
  | "grid"
  | "mini-bar"
  | "object"
  | "table-pivot"
  | "multi"
  | "auto-split";

export type Candidate = {
  id: string;
  display: CardDisplayType;
  variant: DisplayVariant | null;
  mapping: ColumnMapping;
};

export type HardConstraintId =
  | "cartesian-needs-dim-and-measure"
  | "n-must-exceed-1"
  | "series-over-max"
  | "pivot-needs-agg-breakout"
  | "pivot-not-native"
  | "sankey-cycle-or-nodes"
  | "region-needs-keys"
  | "pin-needs-latlon"
  | "scalar-needs-n1"
  | "funnel-one-dim-one-measure"
  | "key-not-measure"
  | "attribute-not-axis"
  | "extraction-not-timeseries"
  | "pie-slices-or-additive-or-negative"
  | "stacked-non-additive"
  | "grid-needs-binned-latlon"
  | "object-needs-pk-n1"
  | "treemap-caps"
  | "boxplot-needs-raw"
  | "scatter-needs-numeric";

export type PenaltyId =
  | "time-not-on-x"
  | "x-cardinality"
  | "series-cardinality"
  | "long-labels-vertical-bar"
  | "pie-baseline"
  | "line-unordered-x"
  | "bar-on-time-x"
  | "measure-dropped"
  | "dimension-dropped"
  | "table-when-chart"
  | "pivot-vs-table-bonus"
  | "scatter-aggregated"
  | "region-match"
  | "combo-many-measures"
  | "role-confidence"
  | "interestingness"
  | "cumulative-not-line"
  | "share-not-stacked"
  | "raw-rows-line"
  | "scalar-multi-measure"
  | "row-vs-bar-short-labels"
  | "alt-only-display"
  | "funnel-shape"
  | "numeric-x-order"
  | "provisional-overflow"
  | "mixed-scale-shared-axis"
  | "secondary-display"
  | "ordered-dim-as-series"
  | "geo-dim-on-axis"
  | "table-no-mini-bar";

export type HardFailure = { id: HardConstraintId; detail: string };

export type PenaltyContribution = {
  id: PenaltyId;
  weight: number;
  value: number;
  contribution: number;
  detail: string;
};

export type ScoredCandidate = Candidate & {
  feasible: boolean;
  hardFailures: HardFailure[];
  penalties: PenaltyContribution[];
  score: number;
};

export type ProvisionalReason =
  | "cardinality-estimated"
  | "region-match-unverified"
  | "n-estimated"
  | "native-raw"
  | "numeric-x-order-unknown"
  | "series-count-estimated"
  | "funnel-order-unverified"
  | "pin-n-unknown";

export type Alternative = {
  display: CardDisplayType;
  variant: DisplayVariant | null;
  settings: Partial<VisualizationSettings>;
  score: number;
  candidateId: string;
};

export type SuggestedOrderBy = {
  columnName: string;
  direction: "asc" | "desc";
} | null;

export type CapViolation = { cap: string; value: number; limit: number };

export type ReconcileOutcome =
  | "kept-stage1"
  | "switched-provisional"
  | "switched-hard-cap"
  | "switched-infeasible"
  | "stage2-only";

export type ReconcileTrace = {
  outcome: ReconcileOutcome;
  stage1Display: CardDisplayType;
  stage2Display: CardDisplayType;
  violatedCaps: CapViolation[];
  mergedSettingKeys: string[];
};

export type TimeSeriesStats = {
  sorted: boolean;
  regular: boolean;
  missingBucketFrac: number;
  allDistinct: boolean;
  inferredUnit: DatetimeUnit | null;
};

export type RowStats = {
  rowCount: number;
  scanned: number;
  truncated: boolean;
  distinct: Record<number, { count: number; exact: boolean }>;
  groupedKeyUnique: boolean | null;
  topShare: Record<number, number>;
  pieSlices: Record<number, number>;
  regionMatch: Record<number, number>;
  labelLength: Record<number, number>;
  allNonNeg: Record<number, boolean>;
  timeSeries: Record<number, TimeSeriesStats>;
  numericX: Record<number, { monotone: boolean; evenlySpaced: boolean }>;
  correlation: Record<string, number>;
  kendallTau: Record<number, number>;
  nonIncreasing: Record<number, boolean>;
  nullCategoryMetricShare: Record<number, number>;
  flat: { allYEqual: boolean; singleX: boolean };
  logCandidate: Record<number, boolean>;
};

export type StageTimings = {
  profileMs: number;
  shapeMs: number;
  enumerateMs: number;
  scoreMs: number;
  settingsMs: number;
  totalMs: number;
};

export type DecisionTrace = {
  stage: 1 | 2;
  profiles: ColumnProfile[];
  shape: Shape;
  candidates: ScoredCandidate[];
  chosenId: string;
  rowStats: RowStats | null;
  ruleFactor: number;
  reconcile: ReconcileTrace | null;
  warnings: string[];
  timings: StageTimings;
};

export type Decision = {
  display: CardDisplayType;
  variant: DisplayVariant | null;
  settings: Partial<VisualizationSettings>;
  columnMapping: Partial<Record<Channel, string[]>>;
  confidence: number;
  provisional: boolean;
  provisionalReasons: ProvisionalReason[];
  alternatives: Alternative[];
  suggestedOrderBy: SuggestedOrderBy;
  trace: DecisionTrace;
};

export type TwoStageTimings = {
  stage1Ms: number;
  rowStatsMs: number;
  stage2Ms: number;
  reconcileMs: number;
  totalMs: number;
  rowsScanned: number;
};

export type TwoStageDecision = {
  stage1: Decision;
  stage2: Decision;
  final: Decision;
  timings: TwoStageTimings;
};

export type NativeItemKind = "aggregate" | "column" | "expression";

export type NativeItem = {
  name: string;
  kind: NativeItemKind;
  fn?: string | null;
  distinct?: boolean;
  contains_aggregate?: boolean;
  in_group_by: boolean;
  source_column?: {
    table: string;
    schema?: string | null;
    column: string;
  } | null;
  semantic_type?: string | null;
  effective_type?: string | null;
  base_type?: string | null;
  fingerprint?: FieldFingerprint | null;
  has_field_values?: FieldValuesType | null;
  visibility_type?: FieldVisibilityType | null;
  preview_display?: boolean | null;
  dimension_interestingness?: number | null;
  database_is_pk?: boolean | null;
};

export type NativeStructure = {
  aggregated: boolean;
  kind: "select" | "union" | "other";
  timing_ms?: number;
  error?: string | null;
  items: NativeItem[];
};

export type DefaultVizInput = {
  query: Lib.Query;
  stageIndex: number;
  resultCols: DatasetColumn[];
  rows?: RowValues[];
  fields?: Map<FieldId, Field>;
  native?: NativeStructure | null;
  rowCountHint?: number;
};

export type ProfileInput = {
  index: number;
  name: string;
  displayName: string;
  datasetCol: DatasetColumn | null;
  libCol: Lib.ColumnMetadata | null;
  info: Lib.ColumnDisplayInfo | null;
  field: Field | null;
  nativeItem: NativeItem | null;
  hasFieldValues: FieldValuesType | null;
  fingerprint: NormalizedFingerprint | null;
  source: ColumnSource;
  agg: AggInfo | null;
  unit: DatetimeUnit | null;
  unitKind: "truncation" | "extraction" | null;
  binning: ColumnProfile["binning"];
  effectiveType: string | null;
  baseType: string | null;
  semantic: string | null;
  visibilityType: FieldVisibilityType | null;
  previewDisplay: boolean | null;
  databaseIsPk: boolean;
  databaseIsAutoIncrement: boolean;
  fkTargetFieldId: FieldId | null;
  remappedFrom: string | null;
  remappedTo: string | null;
  interestingness: number | null;
};

export type ProfileContext = {
  isNative: boolean;
  native: NativeStructure | null;
  aggregatedPrior: boolean;
  rowCount: number | null;
};

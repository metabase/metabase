import * as Lib from "metabase-lib";
import { TYPE } from "metabase-lib/v1/types/constants";
import { isa } from "metabase-lib/v1/types/utils/isa";
import type {
  Aggregation,
  DatasetColumn,
  StructuredQuery,
} from "metabase-types/api";

import {
  ADDITIVE_OPS,
  CUMULATIVE_OPS,
  FLOAT_RESULT_OPS,
  INTEGER_RESULT_OPS,
} from "./constants";
import { columnType } from "./profile";
import type { AggInfo, AggOp, ColumnType, NativeItem } from "./types";

const AGG_OPS: readonly AggOp[] = [
  "count",
  "cum-count",
  "distinct",
  "count-where",
  "distinct-where",
  "avg",
  "share",
  "stddev",
  "var",
  "sum",
  "cum-sum",
  "sum-where",
  "min",
  "max",
  "median",
  "percentile",
];

function isAggOp(value: unknown): value is AggOp {
  return typeof value === "string" && AGG_OPS.some((op) => op === value);
}

function isShareSemantic(semantic: string | null | undefined): boolean {
  return isa(semantic, TYPE.Percentage) || isa(semantic, TYPE.Share);
}

export function buildAggInfo(
  op: AggOp,
  argType: ColumnType,
  semantic: string | null | undefined,
): AggInfo {
  return {
    op,
    argType,
    cumulative: CUMULATIVE_OPS.includes(op),
    share: op === "share" || isShareSemantic(semantic),
    additive: ADDITIVE_OPS.includes(op),
  };
}

function stageQuery(
  legacyQuery: StructuredQuery,
  depth: number,
): StructuredQuery | null {
  if (depth === 0) {
    return legacyQuery;
  }
  const inner = legacyQuery["source-query"];
  return inner ? stageQuery(inner, depth - 1) : null;
}

function legacyStageQuery(
  query: Lib.Query,
  stageIndex: number,
): StructuredQuery | null {
  const legacy = Lib.toLegacyQuery(query);
  if (legacy.type !== "query") {
    return null;
  }
  const stageCount = Lib.stageCount(query);
  const normalizedIndex = stageIndex < 0 ? stageCount + stageIndex : stageIndex;
  return stageQuery(legacy.query, stageCount - 1 - normalizedIndex);
}

function unwrapAggregation(aggregation: Aggregation): unknown[] {
  if (aggregation[0] === "aggregation-options") {
    return aggregation[1];
  }
  return aggregation;
}

function legacyAggOp(
  query: Lib.Query,
  stageIndex: number,
  aggIndex: number,
): AggOp | null {
  const stage = legacyStageQuery(query, stageIndex);
  const aggregation = stage?.aggregation?.[aggIndex];
  if (aggregation == null) {
    return null;
  }
  const [op] = unwrapAggregation(aggregation);
  return isAggOp(op) ? op : null;
}

function resultArgType(op: AggOp, datasetCol?: DatasetColumn): ColumnType {
  if (INTEGER_RESULT_OPS.includes(op) || FLOAT_RESULT_OPS.includes(op)) {
    return "number";
  }
  const argType = datasetCol?.effective_type ?? datasetCol?.base_type;
  return argType ? columnType(argType) : "number";
}

export function aggregationOp(
  query: Lib.Query,
  stageIndex: number,
  aggIndex: number,
  datasetCol?: DatasetColumn,
): AggInfo {
  const op =
    legacyAggOp(query, stageIndex, aggIndex) ??
    datasetCol?.aggregation_type ??
    "unknown";
  return buildAggInfo(
    op,
    resultArgType(op, datasetCol),
    datasetCol?.semantic_type,
  );
}

const NATIVE_FN_OPS: Record<string, AggOp> = {
  COUNT: "count",
  SUM: "sum",
  AVG: "avg",
  MEAN: "avg",
  MIN: "min",
  MAX: "max",
  MEDIAN: "median",
  STDDEV: "stddev",
  STDDEV_POP: "stddev",
  STDDEV_SAMP: "stddev",
  VARIANCE: "var",
  VAR_POP: "var",
  VAR_SAMP: "var",
  PERCENTILE: "percentile",
  PERCENTILE_CONT: "percentile",
  PERCENTILE_DISC: "percentile",
};

function nativeOp(item: NativeItem): AggOp {
  const fn = item.fn?.toUpperCase().replace(/\s+/g, " ").trim() ?? "";
  if (fn === "COUNT DISTINCT" || (fn === "COUNT" && item.distinct)) {
    return "distinct";
  }
  return NATIVE_FN_OPS[fn] ?? "unknown";
}

export function nativeAggInfo(
  item: NativeItem,
  effectiveType: string | null,
): AggInfo {
  const op = nativeOp(item);
  const argType =
    INTEGER_RESULT_OPS.includes(op) || FLOAT_RESULT_OPS.includes(op)
      ? "number"
      : columnType(effectiveType);
  return buildAggInfo(op, argType, item.semantic_type);
}

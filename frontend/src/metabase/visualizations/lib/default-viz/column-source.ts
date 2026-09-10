import * as Lib from "metabase-lib";
import type {
  DatasetColumn,
  DatetimeUnit,
  Field,
  FieldId,
  FieldValuesType,
} from "metabase-types/api";
import { dateTimeRelativeUnits } from "metabase-types/api/query";

import { aggregationOp, nativeAggInfo } from "./aggregation-op";
import { nativeItemsByName, nativeSource } from "./native";
import { normalizeFingerprint } from "./profile";
import type {
  ColumnProfile,
  ColumnSource,
  DefaultVizInput,
  NativeItem,
  ProfileInput,
} from "./types";

type UnitInfo = Pick<ProfileInput, "unit" | "unitKind">;

export function unitKindOf(
  unit: DatetimeUnit | null,
  isExtraction?: boolean,
): ProfileInput["unitKind"] {
  if (unit == null) {
    return null;
  }
  if (isExtraction != null) {
    return isExtraction ? "extraction" : "truncation";
  }
  return dateTimeRelativeUnits.some((relative) => relative === unit)
    ? "extraction"
    : "truncation";
}

function unitFromDatasetColumn(datasetCol: DatasetColumn | null): UnitInfo {
  const unit = datasetCol?.unit ?? null;
  return { unit, unitKind: unitKindOf(unit) };
}

function unitFromBreakout(
  query: Lib.Query,
  stageIndex: number,
  breakout: Lib.BreakoutClause,
): UnitInfo | null {
  const bucket = Lib.temporalBucket(breakout);
  if (bucket == null) {
    return null;
  }
  const bucketInfo = Lib.displayInfo(query, stageIndex, bucket);
  const breakoutInfo = Lib.displayInfo(query, stageIndex, breakout);
  const unit: DatetimeUnit | null = bucketInfo.shortName ?? null;
  const isExtraction =
    breakoutInfo.isTemporalExtraction ?? bucketInfo.isTemporalExtraction;
  return { unit, unitKind: unitKindOf(unit, isExtraction) };
}

function binningFromDatasetColumn(
  datasetCol: DatasetColumn | null,
): ColumnProfile["binning"] {
  const info = datasetCol?.binning_info;
  if (info == null) {
    return null;
  }
  return {
    strategy: info.binning_strategy ?? "default",
    binWidth: info.bin_width,
    numBins: info.num_bins,
    min: info.min_value,
    max: info.max_value,
  };
}

function binningFromBreakout(
  breakout: Lib.BreakoutClause,
): ColumnProfile["binning"] {
  return Lib.binning(breakout) == null ? null : { strategy: "default" };
}

function fieldFor(
  fields: Map<FieldId, Field> | undefined,
  fieldId: FieldId | null | undefined,
): Field | null {
  if (fields == null || fieldId == null) {
    return null;
  }
  return fields.get(fieldId) ?? null;
}

function datasetColumnFieldId(
  datasetCol: DatasetColumn | null,
): FieldId | null {
  return typeof datasetCol?.id === "number" ? datasetCol.id : null;
}

type ColumnSpine = {
  index: number;
  datasetCol: DatasetColumn | null;
  libCol: Lib.ColumnMetadata | null;
  info: Lib.ColumnDisplayInfo | null;
};

function zipMbqlSpine(input: DefaultVizInput): ColumnSpine[] {
  const libCols = Lib.returnedColumns(input.query, input.stageIndex);
  const infos = libCols.map((libCol) =>
    Lib.displayInfo(input.query, input.stageIndex, libCol),
  );
  const zipByIndex = libCols.length === input.resultCols.length;
  const resultByName = new Map(
    input.resultCols.map((col) => [col.name.toLowerCase(), col]),
  );
  return libCols.map((libCol, index) => {
    const datasetCol = zipByIndex
      ? input.resultCols[index]
      : (resultByName.get(infos[index].name.toLowerCase()) ?? null);
    return { index, datasetCol, libCol, info: infos[index] };
  });
}

function nativeSpine(input: DefaultVizInput): ColumnSpine[] {
  return input.resultCols.map((datasetCol, index) => ({
    index,
    datasetCol,
    libCol: null,
    info: null,
  }));
}

type CommonInput = Pick<
  ProfileInput,
  | "index"
  | "name"
  | "displayName"
  | "datasetCol"
  | "libCol"
  | "info"
  | "effectiveType"
  | "baseType"
  | "semantic"
  | "visibilityType"
  | "remappedFrom"
  | "remappedTo"
>;

function commonInput(
  spine: ColumnSpine,
  field: Field | null,
  nativeItem: NativeItem | null,
): CommonInput {
  const { datasetCol, info } = spine;
  const baseType =
    datasetCol?.base_type ?? nativeItem?.base_type ?? field?.base_type ?? null;
  return {
    index: spine.index,
    name: datasetCol?.name ?? info?.name ?? field?.name ?? "",
    displayName:
      datasetCol?.display_name ??
      info?.displayName ??
      field?.display_name ??
      "",
    datasetCol,
    libCol: spine.libCol,
    info,
    effectiveType:
      datasetCol?.effective_type ??
      info?.effectiveType ??
      nativeItem?.effective_type ??
      field?.effective_type ??
      baseType,
    baseType,
    semantic:
      datasetCol?.semantic_type ??
      info?.semanticType ??
      nativeItem?.semantic_type ??
      field?.semantic_type ??
      null,
    visibilityType:
      datasetCol?.visibility_type ??
      nativeItem?.visibility_type ??
      field?.visibility_type ??
      null,
    remappedFrom: datasetCol?.remapped_from ?? null,
    remappedTo: datasetCol?.remapped_to ?? null,
  };
}

function mbqlSource(spine: ColumnSpine): ColumnSource {
  const source = spine.datasetCol?.source;
  if (
    source === "aggregation" ||
    source === "breakout" ||
    source === "fields" ||
    source === "native"
  ) {
    return source;
  }
  if (spine.info?.isAggregation) {
    return "aggregation";
  }
  if (spine.info?.isBreakout) {
    return "breakout";
  }
  if (spine.info?.isCalculated) {
    return "expression";
  }
  return spine.info ? "fields" : "unknown";
}

function aggregationIndexOf(
  spine: ColumnSpine,
  aggregationCounter: { next: number },
): number {
  const ref = spine.datasetCol?.field_ref;
  if (
    Array.isArray(ref) &&
    ref[0] === "aggregation" &&
    typeof ref[1] === "number"
  ) {
    return ref[1];
  }
  return aggregationCounter.next++;
}

// Returned columns list breakouts in clause order, so the n-th breakout
// column maps to the n-th clause when display info carries no positions.
function breakoutClauseFor(
  breakouts: Lib.BreakoutClause[],
  spine: ColumnSpine,
  breakoutCounter: { next: number },
): Lib.BreakoutClause | null {
  const position = spine.info?.breakoutPositions?.[0] ?? breakoutCounter.next++;
  return breakouts[position] ?? null;
}

type ClauseCounters = {
  aggregation: { next: number };
  breakout: { next: number };
};

function mbqlProfileInput(
  input: DefaultVizInput,
  spine: ColumnSpine,
  breakouts: Lib.BreakoutClause[],
  counters: ClauseCounters,
): ProfileInput {
  const { query, stageIndex } = input;
  const searchInfo = spine.libCol
    ? Lib.fieldValuesSearchInfo(query, spine.libCol)
    : null;
  const fieldId = datasetColumnFieldId(spine.datasetCol) ?? searchInfo?.fieldId;
  const field = fieldFor(input.fields, fieldId);
  const source = mbqlSource(spine);
  const breakout =
    source === "breakout"
      ? breakoutClauseFor(breakouts, spine, counters.breakout)
      : null;
  const unit =
    (breakout ? unitFromBreakout(query, stageIndex, breakout) : null) ??
    unitFromDatasetColumn(spine.datasetCol);
  const binning =
    binningFromDatasetColumn(spine.datasetCol) ??
    (breakout ? binningFromBreakout(breakout) : null);
  const agg =
    source === "aggregation"
      ? aggregationOp(
          query,
          stageIndex,
          aggregationIndexOf(spine, counters.aggregation),
          spine.datasetCol ?? undefined,
        )
      : null;
  const hasFieldValues: FieldValuesType | null =
    searchInfo?.hasFieldValues ?? field?.has_field_values ?? null;

  return {
    ...commonInput(spine, field, null),
    field,
    nativeItem: null,
    hasFieldValues,
    fingerprint: normalizeFingerprint(
      spine.datasetCol?.fingerprint ??
        field?.fingerprint ??
        spine.info?.fingerprint ??
        null,
    ),
    source,
    agg,
    unit: unit.unit,
    unitKind: unit.unitKind,
    binning,
    previewDisplay: field?.preview_display ?? null,
    databaseIsPk: field?.database_is_pk ?? false,
    databaseIsAutoIncrement: field?.database_is_auto_increment ?? false,
    fkTargetFieldId:
      spine.datasetCol?.fk_target_field_id ?? field?.fk_target_field_id ?? null,
    interestingness: field?.dimension_interestingness ?? null,
  };
}

function nativeProfileInput(
  input: DefaultVizInput,
  spine: ColumnSpine,
  itemsByName: Map<string, NativeItem>,
): ProfileInput {
  const datasetCol = spine.datasetCol;
  const nativeItem =
    itemsByName.get((datasetCol?.name ?? "").toLowerCase()) ?? null;
  const field = fieldFor(input.fields, datasetColumnFieldId(datasetCol));
  const aggregated = input.native?.aggregated ?? false;
  const source = nativeSource(nativeItem, aggregated);
  const common = commonInput(spine, field, nativeItem);
  const unit = unitFromDatasetColumn(datasetCol);

  return {
    ...common,
    field,
    nativeItem,
    hasFieldValues:
      nativeItem?.has_field_values ?? field?.has_field_values ?? null,
    fingerprint: normalizeFingerprint(
      datasetCol?.fingerprint ??
        nativeItem?.fingerprint ??
        field?.fingerprint ??
        null,
    ),
    source,
    agg:
      nativeItem?.kind === "aggregate"
        ? nativeAggInfo(nativeItem, common.effectiveType)
        : null,
    unit: unit.unit,
    unitKind: unit.unitKind,
    binning: binningFromDatasetColumn(datasetCol),
    previewDisplay:
      nativeItem?.preview_display ?? field?.preview_display ?? null,
    databaseIsPk: nativeItem?.database_is_pk ?? field?.database_is_pk ?? false,
    databaseIsAutoIncrement: field?.database_is_auto_increment ?? false,
    fkTargetFieldId:
      datasetCol?.fk_target_field_id ?? field?.fk_target_field_id ?? null,
    interestingness:
      field?.dimension_interestingness ??
      nativeItem?.dimension_interestingness ??
      null,
  };
}

export function isNativeInput(input: DefaultVizInput): boolean {
  return Lib.queryDisplayInfo(input.query).isNative;
}

export function buildProfileInputs(input: DefaultVizInput): ProfileInput[] {
  if (isNativeInput(input)) {
    const itemsByName = nativeItemsByName(input.native);
    return nativeSpine(input).map((spine) =>
      nativeProfileInput(input, spine, itemsByName),
    );
  }
  const breakouts = Lib.breakouts(input.query, input.stageIndex);
  const counters: ClauseCounters = {
    aggregation: { next: 0 },
    breakout: { next: 0 },
  };
  return zipMbqlSpine(input).map((spine) =>
    mbqlProfileInput(input, spine, breakouts, counters),
  );
}

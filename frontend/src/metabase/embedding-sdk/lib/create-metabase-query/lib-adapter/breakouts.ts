import type { BinningOptions, ColumnMetadata, Query } from "metabase-lib";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { normalizeBreakout } from "../query-utils";

import { STAGE_INDEX, findLibColumn } from "./query-utils";

export function applyBreakouts(
  query: Query,
  breakouts: readonly unknown[] | undefined,
): Query | null {
  let nextQuery = query;

  for (const breakout of breakouts ?? []) {
    const column = findLibColumnForBreakout(nextQuery, breakout);

    if (!column) {
      return null;
    }

    nextQuery = Lib.breakout(nextQuery, STAGE_INDEX, column);
  }

  return nextQuery;
}

function findLibColumnForBreakout(
  query: Query,
  breakout: unknown,
): ColumnMetadata | null {
  const { dimension, options } = normalizeBreakout(breakout);

  if (!dimension) {
    return null;
  }

  const column = findLibColumn(query, dimension);

  if (!column) {
    return null;
  }

  if (typeof options["temporal-unit"] === "string") {
    const bucket = findTemporalBucket(
      query,
      STAGE_INDEX,
      column,
      options["temporal-unit"] as TemporalUnit,
    );

    return bucket ? Lib.withTemporalBucket(column, bucket) : null;
  }

  if (options.binning != null) {
    return buildBinnedColumn(query, column, options.binning);
  }

  return column;
}

const findTemporalBucket = (
  query: Query,
  stageIndex: number,
  column: ColumnMetadata,
  targetUnit: TemporalUnit,
) =>
  Lib.availableTemporalBuckets(query, stageIndex, column).find(
    (bucket) =>
      Lib.displayInfo(query, stageIndex, bucket).shortName === targetUnit,
  ) ?? null;

function buildBinnedColumn(
  query: Query,
  column: ColumnMetadata,
  binningOptions: unknown,
): ColumnMetadata | null {
  if (!isBinningOptions(binningOptions)) {
    return null;
  }

  if (binningOptions.strategy === "default") {
    const columnWithDefaultBinning = Lib.withDefaultBinning(
      query,
      STAGE_INDEX,
      column,
    );

    return Lib.binning(columnWithDefaultBinning)
      ? columnWithDefaultBinning
      : column;
  }

  const bucket = Lib.availableBinningStrategies(
    query,
    STAGE_INDEX,
    column,
  ).find((bucket) => Lib.isBinningStrategy(bucket, binningOptions));

  return bucket ? Lib.withBinning(column, bucket) : column;
}

function isBinningOptions(value: unknown): value is BinningOptions {
  if (typeof value !== "object" || value == null || !("strategy" in value)) {
    return false;
  }

  if (value.strategy === "default") {
    return true;
  }

  if (value.strategy === "num-bins") {
    return "num-bins" in value && typeof value["num-bins"] === "number";
  }

  return (
    value.strategy === "bin-width" &&
    "bin-width" in value &&
    typeof value["bin-width"] === "number"
  );
}

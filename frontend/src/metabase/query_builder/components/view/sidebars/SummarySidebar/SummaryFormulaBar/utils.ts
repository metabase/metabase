import type { NamedExpression } from "metabase/querying/components/FormulaEditor";
import { stableStringify } from "metabase/utils/objects";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import {
  getLegacyStage,
  makeSummaryFormula,
} from "../../../../../utils/summary-formulas";
import type { SummaryWellId } from "../types";
import { getDimensionItems, getValueItems, isFormulaValue } from "../utils";

import type { SummaryFormula, SummaryFormulaEdit } from "./types";

function findFormulaColumn(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): Lib.ColumnMetadata | undefined {
  return Lib.breakoutableColumns(query, stageIndex).find((column) => {
    const info = Lib.displayInfo(query, stageIndex, column);
    return info.isCalculated && info.displayName === name;
  });
}

export function addSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  { name, clause }: NamedExpression,
): Lib.Query {
  if (wellId === "values") {
    return Lib.aggregate(
      query,
      stageIndex,
      Lib.withExpressionName(clause, name),
    );
  }
  const uniqueName = getUniqueExpressionName(query, stageIndex, name);
  const nextQuery = Lib.expression(query, stageIndex, uniqueName, clause);
  const column = findFormulaColumn(nextQuery, stageIndex, uniqueName);
  return Lib.breakout(
    nextQuery,
    stageIndex,
    Lib.withDefaultBucket(nextQuery, stageIndex, checkNotNull(column)),
  );
}

/** The aggregation without its name, so a renamed formula keeps its signature. */
function getAggregationSignature(
  query: Lib.Query,
  stageIndex: number,
  index: number,
): string | undefined {
  const aggregations: unknown = getLegacyStage(query, stageIndex)?.aggregation;
  if (!Array.isArray(aggregations)) {
    return undefined;
  }
  const aggregation: unknown = aggregations[index];
  const isNamedAggregation =
    Array.isArray(aggregation) && aggregation[0] === "aggregation-options";
  return stableStringify(isNamedAggregation ? aggregation[1] : aggregation);
}

function getValueFormulas(
  query: Lib.Query,
  stageIndex: number,
): SummaryFormula[] {
  return getValueItems(query, stageIndex).flatMap((item, index) => {
    const signature = getAggregationSignature(query, stageIndex, index);
    if (!isFormulaValue(item) || signature == null) {
      return [];
    }
    const { displayName, isNamed } = Lib.displayInfo(
      query,
      stageIndex,
      item.clause,
    );
    return [
      {
        wellId: "values",
        key: item.key,
        signature,
        clause: item.clause,
        index,
        position: index,
        name: isNamed ? displayName : undefined,
      },
    ];
  });
}

function getDimensionFormulas(
  query: Lib.Query,
  stageIndex: number,
): SummaryFormula[] {
  const expressionNames = Lib.expressions(query, stageIndex).map(
    (expression) => Lib.displayInfo(query, stageIndex, expression).displayName,
  );
  return getDimensionItems(query, stageIndex).flatMap((item, position) => {
    if (!item.expression) {
      return [];
    }
    const name = Lib.displayInfo(
      query,
      stageIndex,
      item.expression,
    ).displayName;
    const signature = makeSummaryFormula(query, stageIndex, name)?.expression;
    if (signature == null) {
      return [];
    }
    return [
      {
        wellId: "columns",
        key: item.key,
        signature,
        clause: item.expression,
        index: expressionNames.indexOf(name),
        position,
        name,
      },
    ];
  });
}

function getWellFormulas(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
): SummaryFormula[] {
  return wellId === "values"
    ? getValueFormulas(query, stageIndex)
    : getDimensionFormulas(query, stageIndex);
}

export function findSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  key: string,
): SummaryFormula | null {
  return (
    getWellFormulas(query, stageIndex, wellId).find(
      (formula) => formula.key === key,
    ) ?? null
  );
}

/**
 * The formula open in the bar, after the query changed under it. A rename changes the
 * chip's key, so a formula with the same signature stands in for it when it can only be
 * that one, or when it sits where the edited chip was.
 */
export function findEditedFormula(
  query: Lib.Query,
  stageIndex: number,
  edit: SummaryFormulaEdit,
): SummaryFormula | null {
  const candidates = getWellFormulas(query, stageIndex, edit.wellId).filter(
    (formula) => formula.signature === edit.signature,
  );
  const sameChip = candidates.find((formula) => formula.key === edit.key);
  if (sameChip) {
    return sameChip;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return (
    candidates.find((formula) => formula.position === edit.position) ?? null
  );
}

function getFormulaBreakouts(
  query: Lib.Query,
  stageIndex: number,
  name: string,
): Lib.BreakoutClause[] {
  return getDimensionItems(query, stageIndex)
    .filter(
      (item) =>
        item.expression &&
        Lib.displayInfo(query, stageIndex, item.expression).displayName ===
          name,
    )
    .map((item) => item.clause);
}

function findBucket(
  query: Lib.Query,
  stageIndex: number,
  buckets: Lib.Bucket[],
  bucket: Lib.Bucket,
): Lib.Bucket | undefined {
  const { shortName, displayName } = Lib.displayInfo(query, stageIndex, bucket);
  return buckets.find((candidate) => {
    const info = Lib.displayInfo(query, stageIndex, candidate);
    return info.shortName === shortName && info.displayName === displayName;
  });
}

/** Carries a grouping's bucket over to the edited formula, or picks the default for its new type. */
function withPreviousBucket(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
  previousBreakout: Lib.BreakoutClause | undefined,
): Lib.ColumnMetadata {
  const temporalBucket =
    previousBreakout && Lib.temporalBucket(previousBreakout);
  const binning = previousBreakout && Lib.binning(previousBreakout);
  if (temporalBucket) {
    const bucket = findBucket(
      query,
      stageIndex,
      Lib.availableTemporalBuckets(query, stageIndex, column),
      temporalBucket,
    );
    if (bucket) {
      return Lib.withTemporalBucket(column, bucket);
    }
  }
  if (binning) {
    const bucket = findBucket(
      query,
      stageIndex,
      Lib.availableBinningStrategies(query, stageIndex, column),
      binning,
    );
    if (bucket) {
      return Lib.withBinning(column, bucket);
    }
  }
  return Lib.withDefaultBucket(query, stageIndex, column);
}

/** The formula keeps its name: renaming happens on its chip. */
export function replaceSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  formula: SummaryFormula,
  { name, clause }: NamedExpression,
): Lib.Query {
  const formulaName = formula.name ?? name;
  const nextQuery = Lib.replaceClause(
    query,
    stageIndex,
    formula.clause,
    Lib.withExpressionName(clause, formulaName),
  );
  if (formula.wellId === "values") {
    return nextQuery;
  }
  // Lib keeps a grouping's bucket through a rename only. A changed formula leaves bare
  // references, and groupings that became duplicates of each other are dropped.
  const previousBreakouts = getFormulaBreakouts(query, stageIndex, formulaName);
  const currentBreakouts = getFormulaBreakouts(
    nextQuery,
    stageIndex,
    formulaName,
  );
  const rebucketedQuery = currentBreakouts.reduce(
    (currentQuery, breakout, index) => {
      const column = Lib.breakoutColumn(currentQuery, stageIndex, breakout);
      if (!column) {
        return currentQuery;
      }
      return Lib.replaceClause(
        currentQuery,
        stageIndex,
        breakout,
        withPreviousBucket(
          currentQuery,
          stageIndex,
          column,
          previousBreakouts[index],
        ),
      );
    },
    nextQuery,
  );
  return previousBreakouts
    .slice(currentBreakouts.length)
    .reduce((currentQuery, previousBreakout) => {
      const column = findFormulaColumn(currentQuery, stageIndex, formulaName);
      if (!column) {
        return currentQuery;
      }
      return Lib.breakout(
        currentQuery,
        stageIndex,
        withPreviousBucket(currentQuery, stageIndex, column, previousBreakout),
      );
    }, rebucketedQuery);
}

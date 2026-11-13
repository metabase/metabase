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
import { getDimensionItems, getValueItems } from "../utils";

import type { SummaryFormula } from "./types";

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
  return stableStringify(aggregation);
}

export function findSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  key: string,
): SummaryFormula | null {
  if (wellId === "values") {
    const items = getValueItems(query, stageIndex);
    const index = items.findIndex((item) => item.key === key);
    const item = items[index];
    const signature = getAggregationSignature(query, stageIndex, index);
    const isFormula = item?.kind === "expression" || item?.isNamed;
    if (!item || !isFormula || signature == null) {
      return null;
    }
    const { displayName, isNamed } = Lib.displayInfo(
      query,
      stageIndex,
      item.clause,
    );
    return {
      wellId,
      key,
      signature,
      clause: item.clause,
      name: isNamed ? displayName : undefined,
    };
  }
  const item = getDimensionItems(query, stageIndex).find(
    (item) => item.key === key,
  );
  if (!item?.expression) {
    return null;
  }
  const name = Lib.displayInfo(query, stageIndex, item.expression).displayName;
  const signature = makeSummaryFormula(query, stageIndex, name)?.expression;
  if (signature == null) {
    return null;
  }
  return { wellId, key, signature, clause: item.expression, name };
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

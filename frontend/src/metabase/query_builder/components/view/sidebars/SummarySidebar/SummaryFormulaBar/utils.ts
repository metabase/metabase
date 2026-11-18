import {
  type NamedExpression,
  isDefaultFormulaName,
} from "metabase/querying/components/FormulaEditor";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { getUniqueExpressionName } from "metabase-lib/v1/queries/utils/expression";

import type {
  SummaryDimensionWellId,
  SummaryQueryChangeOptions,
  SummaryWellId,
} from "../types";
import { getDimensionItems, getValueItems, isFormulaValue } from "../utils";

import type { SummaryFormula, SummaryFormulaClause } from "./types";

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

function getValueFormulas(
  query: Lib.Query,
  stageIndex: number,
): SummaryFormula[] {
  return getValueItems(query, stageIndex).flatMap((item, index) => {
    if (!isFormulaValue(item)) {
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
        clause: item.clause,
        index,
        name: isNamed ? displayName : undefined,
      },
    ];
  });
}

function getDimensionFormulas(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryDimensionWellId,
): SummaryFormula[] {
  const expressions = Lib.expressions(query, stageIndex);
  return getDimensionItems(query, stageIndex).flatMap(({ expression }) => {
    if (!expression) {
      return [];
    }
    return [
      {
        wellId,
        clause: expression,
        index: expressions.findIndex((clause) =>
          Lib.isSameClause(clause, expression),
        ),
        name: Lib.displayInfo(query, stageIndex, expression).displayName,
      },
    ];
  });
}

/** The formula of a chip in the well, or null when no chip has it. */
export function findSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  wellId: SummaryWellId,
  clause: SummaryFormulaClause,
): SummaryFormula | null {
  const formulas =
    wellId === "values"
      ? getValueFormulas(query, stageIndex)
      : getDimensionFormulas(query, stageIndex, wellId);
  return (
    formulas.find((formula) => Lib.isSameClause(formula.clause, clause)) ?? null
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

/**
 * A name given on the chip stays through an edit. A name generated from the formula follows
 * the new formula, unless it still describes it.
 */
function getEditedFormulaName(
  query: Lib.Query,
  stageIndex: number,
  formula: SummaryFormula,
  sourceName: string,
  hasCustomName: boolean,
): string {
  const { name } = formula;
  if (name == null) {
    return sourceName;
  }
  if (hasCustomName || isDefaultFormulaName(name, sourceName)) {
    return name;
  }
  return formula.wellId === "values"
    ? sourceName
    : getUniqueExpressionName(query, stageIndex, sourceName);
}

function rebucketFormulaBreakouts(
  query: Lib.Query,
  nextQuery: Lib.Query,
  stageIndex: number,
  name: string,
  nextName: string,
): Lib.Query {
  const column = findFormulaColumn(query, stageIndex, name);
  const nextColumn = findFormulaColumn(nextQuery, stageIndex, nextName);
  if (!column || !nextColumn) {
    return nextQuery;
  }
  const isSameType =
    Lib.displayInfo(query, stageIndex, column).effectiveType ===
    Lib.displayInfo(nextQuery, stageIndex, nextColumn).effectiveType;
  if (isSameType) {
    // Lib already kept each grouping, its bucket, and the references to it in later stages.
    return nextQuery;
  }
  // A new type can drop the old bucket and leave groupings that duplicate each other, which
  // Lib removes. A clause, not a column, keeps the references to the grouping in later stages.
  const previousBreakouts = getFormulaBreakouts(query, stageIndex, name);
  const currentBreakouts = getFormulaBreakouts(nextQuery, stageIndex, nextName);
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
        Lib.expressionClause(
          withPreviousBucket(
            currentQuery,
            stageIndex,
            column,
            previousBreakouts[index],
          ),
        ),
      );
    },
    nextQuery,
  );
  return previousBreakouts
    .slice(currentBreakouts.length)
    .reduce((currentQuery, previousBreakout) => {
      const column = findFormulaColumn(currentQuery, stageIndex, nextName);
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

export function editSummaryFormula(
  query: Lib.Query,
  stageIndex: number,
  formula: SummaryFormula,
  { name: sourceName, clause }: NamedExpression,
  hasCustomName: boolean,
): { query: Lib.Query; options: SummaryQueryChangeOptions } {
  const nextName = getEditedFormulaName(
    query,
    stageIndex,
    formula,
    sourceName,
    hasCustomName,
  );
  const nextQuery = Lib.replaceClause(
    query,
    stageIndex,
    formula.clause,
    Lib.withExpressionName(clause, nextName),
  );
  if (formula.wellId === "values" || formula.name == null) {
    return { query: nextQuery, options: { editedFormula: true } };
  }
  const renamedFormula =
    nextName === formula.name ? undefined : { name: formula.name, nextName };
  return {
    query: rebucketFormulaBreakouts(
      query,
      nextQuery,
      stageIndex,
      formula.name,
      nextName,
    ),
    options: { editedFormula: true, renamedFormula },
  };
}

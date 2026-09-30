import { t } from "ttag";

import {
  clausesForMode,
  getClauseDefinition,
} from "metabase/querying/expressions";
import type { Database } from "metabase-types/api";

export interface FormulaFunctionSpec {
  /** Upper-cased, which is how formulas are matched and displayed. */
  name: string;
  signature: string;
  description: string;
  /** Grouping shown in the suggestion list, e.g. "String", "Date". */
  category: string;
  /**
   * True when the browser computes this itself, so the cell fills in as
   * you type. False means the formula becomes a real custom column and
   * the database computes it, which costs one query round trip.
   */
  isLocal: boolean;
}

/**
 * Range functions, which have no Metabase equivalent: an MBQL expression
 * is evaluated per row and cannot reach across rows, so SUM(A1:A10) only
 * exists client-side. These stay in the list because they're the first
 * thing anyone tries in a spreadsheet, but they can't be saved as a
 * column — the formula field records that as its saveError.
 */
function getSpreadsheetRangeFunctions(): FormulaFunctionSpec[] {
  return [
    {
      name: "SUM",
      signature: "SUM(range)",
      description: t`Adds up the numbers in a range, e.g. SUM(A1:A10).`,
      category: "spreadsheet",
      isLocal: true,
    },
    {
      name: "AVERAGE",
      signature: "AVERAGE(range)",
      description: t`Averages the numbers in a range.`,
      category: "spreadsheet",
      isLocal: true,
    },
    {
      name: "COUNT",
      signature: "COUNT(range)",
      description: t`Counts the numeric values in a range.`,
      category: "spreadsheet",
      isLocal: true,
    },
    {
      name: "MIN",
      signature: "MIN(range)",
      description: t`Returns the smallest value in a range.`,
      category: "spreadsheet",
      isLocal: true,
    },
    {
      name: "MAX",
      signature: "MAX(range)",
      description: t`Returns the largest value in a range.`,
      category: "spreadsheet",
      isLocal: true,
    },
  ];
}

/** Functions the local engine implements, so they don't need a round trip
 * even though Metabase also has them. */
const LOCAL_CLAUSE_NAMES = new Set(["round", "abs"]);

function buildSignature(displayName: string, argNames: string[]): string {
  return `${displayName.toUpperCase()}(${argNames.join(", ")})`;
}

/**
 * Every function that can be typed into a spreadsheet cell: Metabase's own
 * expression library plus the handful of range functions above.
 *
 * Sourced from MBQL_CLAUSES rather than a hand-maintained list, so the
 * spreadsheet automatically offers whatever the expression editor offers,
 * and the two can't drift apart.
 */
let cachedFunctions: {
  databaseId: number | null;
  functions: FormulaFunctionSpec[];
} | null = null;

export function getFormulaFunctions(
  database?: Database | null,
): FormulaFunctionSpec[] {
  // Rebuilt only when the database changes. Suggestions are recomputed on
  // every keystroke, and building this walks all ~70 clause definitions.
  const databaseId = database?.id ?? null;
  if (cachedFunctions?.databaseId === databaseId) {
    return cachedFunctions.functions;
  }

  const metabaseFunctions = clausesForMode("expression").map((clause) => {
    const argNames = clause.args
      .map((arg) => (arg.optional ? `${arg.name}?` : arg.name))
      .filter((name) => name !== "");
    // description() takes the database because a few clauses word
    // themselves differently per engine; it's safe to call without one.
    const described = database ? clause.description?.(database) : undefined;
    return {
      name: clause.displayName.toUpperCase(),
      signature: buildSignature(clause.displayName, argNames),
      description: described ?? "",
      category: clause.category ?? "other",
      isLocal: LOCAL_CLAUSE_NAMES.has(clause.name),
    };
  });

  // The range functions win on a name clash, since their range form is
  // what a spreadsheet user means by "SUM".
  const rangeFunctions = getSpreadsheetRangeFunctions();
  const rangeNames = new Set(rangeFunctions.map((f) => f.name));
  const functions = [
    ...rangeFunctions,
    ...metabaseFunctions.filter((fn) => !rangeNames.has(fn.name)),
  ].sort((a, b) => a.name.localeCompare(b.name));

  cachedFunctions = { databaseId, functions };
  return functions;
}

/** The spec for one function name, or null when it isn't one we know. */
export function getFormulaFunction(
  name: string,
  database?: Database | null,
): FormulaFunctionSpec | null {
  const upper = name.toUpperCase();
  return getFormulaFunctions(database).find((fn) => fn.name === upper) ?? null;
}

/** Whether a name is a real function at all, used to tell a typo from a
 * function this build simply evaluates server-side. */
export function isKnownFunction(name: string): boolean {
  return (
    getSpreadsheetRangeFunctions().some(
      (fn) => fn.name === name.toUpperCase(),
    ) || getClauseDefinition(name.toLowerCase()) != null
  );
}

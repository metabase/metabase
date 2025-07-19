import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import type * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";

import {
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  MBQL_CLAUSES,
} from "./config";
import type { MBQLClauseDefinition, MBQLClauseFunctionConfig } from "./types";

export type DefinedClauseName = keyof typeof MBQL_CLAUSES;

export function isDefinedClause(name: string): name is DefinedClauseName {
  return name in MBQL_CLAUSES;
}

export function getClauseDefinition(
  name: DefinedClauseName,
): MBQLClauseFunctionConfig;
export function getClauseDefinition(
  name: string,
): MBQLClauseFunctionConfig | undefined;
export function getClauseDefinition(
  name: string,
): MBQLClauseFunctionConfig | undefined {
  if (!isDefinedClause(name)) {
    return undefined;
  }

  const defn: MBQLClauseDefinition = MBQL_CLAUSES[name];
  const args = defn.args();

  return {
    name,
    argType(index) {
      return args[index]?.type;
    },
    ...defn,
    hasOptions: Boolean(defn.hasOptions),
    multiple: Boolean(defn.multiple),
    args,
  };
}

const EXPRESSION_TO_MBQL_NAME = new Map(
  Object.entries(MBQL_CLAUSES).map(([mbql, { displayName }]) => [
    // case-insensitive
    displayName.toLowerCase(),
    mbql as DefinedClauseName,
  ]),
);

export function getMBQLName(
  expressionName: string,
): DefinedClauseName | undefined {
  // case-insensitive
  return EXPRESSION_TO_MBQL_NAME.get(expressionName.trim().toLowerCase());
}

export const clausesForMode = _.memoize(
  (expressionMode: Lib.ExpressionMode) => {
    const base =
      expressionMode === "aggregation"
        ? AGGREGATION_FUNCTIONS
        : EXPRESSION_FUNCTIONS;

    return Object.keys(base)
      .map(getClauseDefinition)
      .filter(isNotNull)
      .filter(function excludeOffsetInFilterExpressions(clause) {
        const isOffset = clause.name === "offset";
        const isFilterExpression = expressionMode === "filter";
        return !isOffset || !isFilterExpression;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  (expressionMode) => expressionMode,
);

export function getSupportedClauses({
  expressionMode,
  database,
}: {
  expressionMode: Lib.ExpressionMode;
  database?: Database | null;
}) {
  return clausesForMode(expressionMode)
    .filter((clause) => database?.hasFeature(clause.requiresFeature))
    .filter(function disableOffsetInFilterExpressions(clause) {
      const isOffset = clause.name === "offset";
      const isFilterExpression = expressionMode === "filter";
      const isOffsetInFilterExpression = isOffset && isFilterExpression;
      return !isOffsetInFilterExpression;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

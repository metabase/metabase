import { MBQL_CLAUSES } from "./config";
import type { MBQLClauseFunctionConfig } from "./types";

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
  if (isDefinedClause(name)) {
    return MBQL_CLAUSES[name];
  }
  return undefined;
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

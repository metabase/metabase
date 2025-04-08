import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import {
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  type HelpText,
  type MBQLClauseFunctionConfig,
  type StartRule,
  getClauseDefinition,
} from "metabase-lib/v1/expressions";
import { getHelpText } from "metabase-lib/v1/expressions/helper-text-strings";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

const EXPRESSION_CLAUSES = Array.from(EXPRESSION_FUNCTIONS)
  .map(getClauseDefinition)
  .filter(isNotNull);
const AGGREGATION_CLAUSES = Array.from(AGGREGATION_FUNCTIONS)
  .map(getClauseDefinition)
  .filter(isNotNull);

export function getSearchPlaceholder(startRule: StartRule) {
  if (startRule === "expression" || startRule === "boolean") {
    return t`Search functions…`;
  }
  if (startRule === "aggregation") {
    return t`Search aggregations…`;
  }
}

function getClauses(startRule: StartRule): MBQLClauseFunctionConfig[] {
  if (startRule === "expression" || startRule === "boolean") {
    return EXPRESSION_CLAUSES;
  }
  if (startRule === "aggregation") {
    return AGGREGATION_CLAUSES;
  }
  return [];
}

function getCategoryName(category: string) {
  switch (category) {
    case "logical":
      return t`Logical functions`;
    case "math":
      return t`Math functions`;
    case "string":
      return t`String functions`;
    case "date":
      return t`Date functions`;
    case "conversion":
      return t`Conversions`;
    case "window":
      return t`Window functions`;
    case "aggregation":
      return t`Aggregations`;
  }
}

export function getFilteredClauses({
  startRule,
  filter,
  database,
  reportTimezone,
}: {
  startRule: StartRule;
  filter: string;
  database: Database | null;
  reportTimezone?: string;
}) {
  const clauses = getClauses(startRule);
  const filteredClauses = clauses
    .filter(
      (clause) =>
        database?.hasFeature(clause.requiresFeature) &&
        clause.displayName.toLowerCase().includes(filter.toLowerCase()),
    )
    .map((clause) =>
      clause.name && database
        ? getHelpText(clause.name, database, reportTimezone)
        : null,
    )
    .filter(isNotNull);

  const filteredCategories = new Set(
    filteredClauses.map((clause) => clause.category),
  );

  return Array.from(filteredCategories)
    .sort()
    .map((category) => ({
      category,
      displayName: getCategoryName(category),
      clauses: filteredClauses
        .filter((clause) => clause.category === category)
        .sort(byName),
    }));
}

function byName(a: HelpText, b: HelpText) {
  return a.structure.localeCompare(b.structure);
}

export function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

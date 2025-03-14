import { t } from "ttag";

import * as Lib from "metabase-lib";
import {
  AGGREGATION_FUNCTIONS,
  EXPRESSION_FUNCTIONS,
  type MBQLClauseFunctionConfig,
  MBQL_CLAUSES,
} from "metabase-lib/v1/expressions";
import type Database from "metabase-lib/v1/metadata/Database";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import type { StartRule } from "../types";

const EXPRESSION_CLAUSES = Array.from(EXPRESSION_FUNCTIONS).map(
  name => MBQL_CLAUSES[name],
);
const AGGREGATION_CLAUSES = Array.from(AGGREGATION_FUNCTIONS).map(
  name => MBQL_CLAUSES[name],
);

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

export function getFilteredClauses({
  startRule,
  filter,
  database,
}: {
  startRule: StartRule;
  filter: string;
  database: Database | null;
}) {
  const clauses = getClauses(startRule);
  return clauses.filter(
    clause =>
      database?.hasFeature(clause.requiresFeature) &&
      clause.displayName.toLowerCase().includes(filter.toLowerCase()),
  );
}

export function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

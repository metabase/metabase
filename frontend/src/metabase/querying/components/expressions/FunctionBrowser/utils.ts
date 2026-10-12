import { t } from "ttag";

import {
  type HelpText,
  getHelpText,
  getSupportedClauses,
} from "metabase/querying/expressions";
import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

export function getSearchPlaceholder(expressionMode: Lib.ExpressionMode) {
  if (expressionMode === "expression" || expressionMode === "filter") {
    return t`Search functions…`;
  }
  if (expressionMode === "aggregation") {
    return t`Search aggregations…`;
  }
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
  expressionMode,
  filter,
  database,
  reportTimezone,
}: {
  expressionMode: Lib.ExpressionMode;
  filter: string;
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
}) {
  const filteredClauses = getSupportedClauses({ expressionMode, database })
    .filter((clause) =>
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
  return a.displayName.localeCompare(b.displayName);
}

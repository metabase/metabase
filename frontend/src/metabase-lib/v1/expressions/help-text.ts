import type * as Lib from "metabase-lib";
import type { HelpText, HelpTextArg } from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";

import { getClauseDefinition } from "./clause";

export function getHelpText(
  name: string,
  database: Database,
  reportTimezone?: string,
): HelpText | null {
  const clause = getClauseDefinition(name);
  if (!clause) {
    return null;
  }

  const { displayName, description, category, docsPage } = clause;
  const args = clause.args();

  if (!description || !category) {
    return null;
  }

  return {
    name,
    displayName,
    category,
    args,
    example: getExample(name, args),
    description: description(database, reportTimezone),
    docsUrl: docsPage
      ? `questions/query-builder/expressions/${docsPage}`
      : "questions/query-builder/expressions",
  };
}

/**
 * Build the expression example as a Lib.ExpressionParts manually.
 * This is necessary because we don't have a query to refer to in the examples.
 */
function getExample(name: string, args: HelpTextArg[]): Lib.ExpressionParts {
  return {
    operator: name as Lib.ExpressionOperator,
    options: {},
    args: args.flatMap((arg) => arg.example),
  };
}

import { isNotNull } from "metabase/utils/types";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { getClauseDefinition } from "./clause";

export type HelpText = {
  name: string;
  category: Lib.MBQLClauseCategory;
  args: Lib.ClauseArgDefinition[];
  namedArgs: Lib.NamedArgConfig[];
  description: string;
  example: Lib.ExpressionParts;
  displayName: string;
  docsUrl: string;
};

export function getHelpText(
  name: string,
  database: Pick<Database, "engine" | "features">,
  reportTimezone?: string,
): HelpText | null {
  const clause = getClauseDefinition(name);
  if (!clause) {
    return null;
  }

  const { displayName, args, namedArgs, description, category, docsPage } =
    clause;

  if (!description || !category) {
    return null;
  }

  return {
    name,
    displayName,
    category,
    args,
    namedArgs,
    example: getExample(name, args, namedArgs),
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
function getExample(
  name: string,
  args: Lib.ClauseArgDefinition[],
  namedArgs: Lib.NamedArgConfig[],
): Lib.ExpressionParts {
  return {
    // Unjustified type cast. FIXME
    operator: name as Lib.ExpressionOperator,
    options: namedArgExampleOptions(namedArgs),
    args: args.flatMap((arg) => arg.example).filter(isNotNull),
  };
}

function namedArgExampleOptions(
  namedArgs: readonly Lib.NamedArgConfig[],
): Lib.ExpressionOptions {
  const options: Record<string, string> = {};

  for (const namedArg of namedArgs) {
    if (namedArg.example != null) {
      options[namedArg.option] = namedArg.example;
    }
  }

  // Each named arg's example is a valid value for its option key.
  return options as Lib.ExpressionOptions;
}

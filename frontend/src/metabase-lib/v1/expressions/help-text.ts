import type * as Lib from "metabase-lib";
import type { HelpText, HelpTextArg } from "metabase-lib/v1/expressions/types";
import type Database from "metabase-lib/v1/metadata/Database";

import { HELPER_TEXT_STRINGS } from "./helper-text-strings";

export function getHelpText(
  name: string,
  database: Database,
  reportTimezone?: string,
): HelpText | undefined {
  const helperTextConfig = HELPER_TEXT_STRINGS.find((h) => h.name === name);

  if (!helperTextConfig) {
    return;
  }

  const { description, docsPage } = helperTextConfig;
  const args = helperTextConfig.args();

  return {
    ...helperTextConfig,
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

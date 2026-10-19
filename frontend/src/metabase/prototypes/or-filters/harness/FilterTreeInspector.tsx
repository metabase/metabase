import { t } from "ttag";

import { Code, Stack, Text } from "metabase/ui";
import * as Lib from "metabase-lib";

import { getFilterLabel, isExpressionParts } from "./clauses";

type FilterTreeInspectorProps = {
  query: Lib.Query;
  stageIndex: number;
};

/**
 * The stage's filters as an indented operator tree, next to what
 * `Lib.displayInfo` says about each top-level clause.
 */
export function FilterTreeInspector({
  query,
  stageIndex,
}: FilterTreeInspectorProps) {
  const filters = Lib.filters(query, stageIndex);

  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Filter tree`}</Text>
      {filters.length === 0 && <Text c="text-secondary">{t`No filters.`}</Text>}
      {filters.map((filter, index) => (
        <Stack key={index} gap="xs">
          <Text size="sm" c="text-secondary">
            {t`displayInfo: ${getFilterLabel(query, stageIndex, filter)}`}
          </Text>
          <Code block>
            {describeParts(
              query,
              stageIndex,
              Lib.expressionParts(query, stageIndex, filter),
              0,
            ).join("\n")}
          </Code>
        </Stack>
      ))}
      <Code block>{JSON.stringify(Lib.toLegacyQuery(query), null, 2)}</Code>
    </Stack>
  );
}

function describeParts(
  query: Lib.Query,
  stageIndex: number,
  parts: Lib.ExpressionParts,
  depth: number,
): string[] {
  const indent = "  ".repeat(depth);
  const argLines = parts.args.flatMap((arg) =>
    isExpressionParts(arg)
      ? describeParts(query, stageIndex, arg, depth + 1)
      : [`${indent}  ${describeArg(query, stageIndex, arg)}`],
  );
  return [`${indent}${parts.operator}`, ...argLines];
}

function describeArg(
  query: Lib.Query,
  stageIndex: number,
  arg: Lib.ExpressionArg,
): string {
  if (Lib.isColumnMetadata(arg)) {
    return `[${Lib.displayInfo(query, stageIndex, arg).longDisplayName}]`;
  }
  if (Lib.isSegmentMetadata(arg)) {
    return `<${Lib.displayInfo(query, stageIndex, arg).displayName}>`;
  }
  if (Lib.isMetricMetadata(arg)) {
    return `<${Lib.displayInfo(query, stageIndex, arg).displayName}>`;
  }
  if (typeof arg === "object") {
    return "<measure>";
  }
  return typeof arg === "bigint" ? arg.toString() : JSON.stringify(arg);
}

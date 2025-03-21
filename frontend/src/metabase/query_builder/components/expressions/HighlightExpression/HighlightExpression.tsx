import cx from "classnames";
import { type HTMLAttributes, useMemo } from "react";
import { useAsync } from "react-use";

import type * as Lib from "metabase-lib";
import { format, formatExpressionParts } from "metabase-lib/v1/expressions";

import S from "./HighlightExpression.module.css";
import { highlight } from "./utils";

export function HighlightExpression({
  expression,
  query,
  stageIndex,
  expressionIndex,
  printWidth = Infinity,
  ...props
}: {
  expression: Lib.ExpressionClause;
  query: Lib.Query;
  stageIndex: number;
  expressionIndex?: number;
  printWidth?: number;
  inline?: boolean;
} & HTMLAttributes<HTMLPreElement>) {
  const { value: formattedExpression } = useAsync(
    () =>
      format(expression, { query, stageIndex, expressionIndex, printWidth }),
    [expression, query, stageIndex, expressionIndex, printWidth],
  );

  return (
    <HighlightExpressionSource
      expression={formattedExpression ?? ""}
      {...props}
    />
  );
}

export function HighlightExpressionParts({
  expression,
  printWidth = Infinity,
  ...props
}: {
  expression: Lib.ExpressionParts;
  inline?: boolean;
  printWidth?: number;
} & HTMLAttributes<HTMLPreElement>) {
  const { value: formattedExpression } = useAsync(
    () => formatExpressionParts(expression, { printWidth }),
    [expression, printWidth],
  );

  return (
    <HighlightExpressionSource
      expression={formattedExpression ?? ""}
      {...props}
    />
  );
}

export function HighlightExpressionSource({
  expression,
  inline = false,
  ...props
}: {
  inline?: boolean;
  expression: string;
} & HTMLAttributes<HTMLPreElement>) {
  const __html = useMemo(() => highlight(expression), [expression]);

  return (
    <code
      className={cx(S.highlight, inline ? S.inline : S.block)}
      dangerouslySetInnerHTML={{ __html }}
      {...props}
    />
  );
}

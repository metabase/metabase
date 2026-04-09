import cx from "classnames";
import { type HTMLAttributes, useMemo } from "react";
import { useAsync } from "react-use";

import { formatExpressionParts } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";

import S from "./HighlightExpression.module.css";
import { highlight } from "./utils";

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

import { type HTMLAttributes, useMemo } from "react";
import { useAsync } from "react-use";

import { formatExample } from "metabase-lib/v1/expressions";
import type { Expression } from "metabase-types/api";

import S from "./HighlightExpression.module.css";
import { highlight } from "./utils";

export function HighlightExampleExpression({
  expression,
  printWidth = Infinity,
  ...props
}: {
  expression: Expression;
  printWidth?: number;
} & HTMLAttributes<HTMLPreElement>) {
  const { value: formattedExpression } = useAsync(
    () => formatExample(expression, { printWidth }),
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
  ...props
}: {
  expression: string;
} & HTMLAttributes<HTMLPreElement>) {
  const __html = useMemo(() => highlight(expression), [expression]);

  return (
    <pre
      {...props}
      className={S.highlight}
      dangerouslySetInnerHTML={{ __html }}
    />
  );
}

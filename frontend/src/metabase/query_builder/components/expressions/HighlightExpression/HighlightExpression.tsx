import { type HTMLAttributes, useEffect, useMemo, useState } from "react";

import { format } from "metabase-lib/v1/expressions";
import type { Expression } from "metabase-types/api";

import S from "./HighlightExpression.module.css";
import { highlight } from "./utils";

export function HighlightExpression({
  expression,
  printWidth = Infinity,
  ...props
}: {
  expression: Expression;
  printWidth?: number;
} & HTMLAttributes<HTMLPreElement>) {
  const [formattedExpression, setFormattedExpression] = useState<string>("");

  useEffect(() => {
    format(expression, {
      printWidth,
      // @ts-expect-error: the examples do not use clauses that depend on query
      query: null,
      stageIndex: -1,
    })
      .catch(() => "")
      .then(setFormattedExpression);
  }, [expression, printWidth]);

  return (
    <HighlightExpressionSource expression={formattedExpression} {...props} />
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

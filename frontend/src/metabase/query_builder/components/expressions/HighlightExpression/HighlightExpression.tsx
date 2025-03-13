import { type HTMLAttributes, useEffect, useMemo, useState } from "react";

import { formatExample } from "metabase-lib/v1/expressions";
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
    formatExample(expression, { printWidth })
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

import { useMemo } from "react";

import S from "./HighlightExpression.module.css";
import { highlight } from "./util";

type HighlightExpressionProps = {
  expression: string;
  "data-testid"?: string;
};

export function HighlightExpression({
  expression,
  ...props
}: HighlightExpressionProps) {
  const __html = useMemo(() => highlight(expression), [expression]);

  return (
    <pre
      {...props}
      className={S.highlight}
      dangerouslySetInnerHTML={{ __html }}
    />
  );
}

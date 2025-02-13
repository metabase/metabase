import { useMemo } from "react";

import S from "./HighlightExpression.module.css";
import { highlight } from "./util";

type HighlightExpressionProps = {
  expression: string;
};

export function HighlightExpression({ expression }: HighlightExpressionProps) {
  const __html = useMemo(() => highlight(expression), [expression]);

  return <pre className={S.highlight} dangerouslySetInnerHTML={{ __html }} />;
}

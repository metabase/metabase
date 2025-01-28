import { useMemo } from "react";

import { highlight } from "./util";

export function Highlight({ expression }: { expression: string }) {
  const __html = useMemo(() => highlight(expression), [expression]);
  return <pre dangerouslySetInnerHTML={{ __html }} />;
}

import { QuestionChart } from "../../harness/QuestionChart";
import type { ChartCanvasProps } from "../../types";

/** Today's behavior: the real chart with the real click-actions popover. */
export function BaselinePrototype(props: ChartCanvasProps) {
  return <QuestionChart {...props} />;
}

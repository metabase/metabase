import type { FilterCanvasProps } from "../../types";

import { ExpressionBar } from "./ExpressionBar";

const ROWS_STAGE = 0;

/** The Data zone as the iteration 2 drill-through bar, flush across the top. */
export function ExpressionBarDataZone({ query, onChange }: FilterCanvasProps) {
  return (
    <ExpressionBar query={query} stageIndex={ROWS_STAGE} onChange={onChange} />
  );
}

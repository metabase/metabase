import type { DrillPoint } from "../sql/compose";

/** A clicked part of an analysis chart, and the actors in it. */
export type ChartDrill = {
  point: DrillPoint;
  /** The conditions that pick the actors, e.g. "Reached step 2: Signed up". */
  label: string;
  /** How many actors the chart shows for it, when it shows a count. */
  count: number | null;
};

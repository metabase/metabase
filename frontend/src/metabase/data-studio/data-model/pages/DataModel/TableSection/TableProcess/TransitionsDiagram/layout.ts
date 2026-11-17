import dagre from "@dagrejs/dagre";

import type { OrderedValue } from "metabase/metadata/lifecycle";

import type { TransitionRow } from "../use-process-model";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 56;

// The schema viewer's spacing
const NODE_SEP = 60;
const RANK_SEP = 120;

/** Which way an edge leaves its state and arrives at the next */
export type EdgeRoute =
  /** The next state over: right side to left side */
  | "next"
  /** Skips ahead: loops over the top */
  | "skip"
  /** Goes back, or between states in the same column: loops under */
  | "back";

export type DiagramLayout = {
  positions: Map<string, { x: number; y: number }>;
  getRoute: (from: string, to: string) => EdgeRoute;
  /** How many columns an edge crosses, so longer loops sit further out */
  getSpan: (from: string, to: string) => number;
};

/**
 * Left to right, like the schema viewer, shaped by the happy path alone so
 * the picture holds still while an admin relabels edges: open states in a
 * row, final states stacked in the last column.
 */
export function layoutStates(
  states: OrderedValue[],
  rows: TransitionRow[],
): DiagramLayout {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: NODE_SEP, ranksep: RANK_SEP });
  graph.setDefaultEdgeLabel(() => ({}));

  states.forEach(({ value }) =>
    graph.setNode(value, { width: NODE_WIDTH, height: NODE_HEIGHT }),
  );
  rows
    .filter(({ kind }) => kind === "typical")
    .forEach(({ from, to }) => graph.setEdge(from, to));

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  states.forEach(({ value }) => {
    const { x, y } = graph.node(value);
    // Dagre places centers; React Flow places top-left corners
    positions.set(value, { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 });
  });

  const columns = [...new Set([...positions.values()].map(({ x }) => x))].sort(
    (a, b) => a - b,
  );
  const columnOf = (state: string) =>
    columns.indexOf(positions.get(state)?.x ?? Number.NaN);
  const getStep = (from: string, to: string) => columnOf(to) - columnOf(from);

  return {
    positions,
    getRoute: (from, to) => {
      const step = getStep(from, to);
      return step === 1 ? "next" : step > 1 ? "skip" : "back";
    },
    getSpan: (from, to) => Math.abs(getStep(from, to)),
  };
}

import type { RowValue, RowValues } from "metabase-types/api";

type Graph = Map<RowValue, Set<RowValue>>;

const buildGraph = (
  rows: RowValues[],
  sourceIndex: number,
  targetIndex: number,
): Graph =>
  rows.reduce((graph, row) => {
    const source = row[sourceIndex];
    const target = row[targetIndex];

    const edges = graph.get(source) ?? new Set();
    edges.add(target);
    graph.set(source, edges);
    return graph;
  }, new Map());

const detectCycleFromNode = (
  node: RowValue,
  graph: Graph,
  visited: Set<RowValue>,
  pathNodes: Set<RowValue>,
): boolean => {
  visited.add(node);
  pathNodes.add(node);

  const neighbors = graph.get(node) ?? new Set();
  for (const neighbor of neighbors) {
    const hasCycle = pathNodes.has(neighbor);
    if (hasCycle) {
      return true;
    }

    if (
      !visited.has(neighbor) &&
      detectCycleFromNode(neighbor, graph, visited, pathNodes)
    ) {
      return true;
    }
  }

  pathNodes.delete(node);
  return false;
};
export const hasCyclicFlow = (
  rows: RowValues[],
  sourceIndex: number,
  targetIndex: number,
): boolean => {
  const graph = buildGraph(rows, sourceIndex, targetIndex);
  const visited = new Set<RowValue>();
  const pathNodes = new Set<RowValue>();

  return Array.from(graph.keys()).some(
    node =>
      !visited.has(node) &&
      detectCycleFromNode(node, graph, visited, pathNodes),
  );
};

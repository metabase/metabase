import dagre from "@dagrejs/dagre";

import type { SchemaViewerFlowNode } from "../../types";

import { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./constants";
import type {
  DagreLayoutNode,
  DagreLayoutRequest,
  DagreNodePosition,
  LayoutEdge,
} from "./types";

function assertDimension(value: number | undefined, name: string): number {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }
  return value;
}

function toDagreLayoutNode(node: SchemaViewerFlowNode): DagreLayoutNode {
  return {
    id: node.id,
    width: assertDimension(node.width, `width for node ${node.id}`),
    height: assertDimension(node.height, `height for node ${node.id}`),
  };
}

export function getDagreLayoutRequest(
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly LayoutEdge[],
): DagreLayoutRequest {
  return {
    nodes: nodes.map(toDagreLayoutNode),
    edges: edges.map(({ source, target }) => ({ source, target })),
  };
}

const COMPONENT_GRID_ASPECT_RATIO = 1.6;

type IndexedLayoutNode = DagreLayoutNode & {
  order: number;
};

type ConnectedComponent = {
  order: number;
  nodes: IndexedLayoutNode[];
  edges: LayoutEdge[];
};

type ComponentLayout = {
  order: number;
  nodeCount: number;
  width: number;
  height: number;
  positions: DagreNodePosition[];
};

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function partitionConnectedComponents(
  nodes: readonly IndexedLayoutNode[],
  edges: readonly LayoutEdge[],
): ConnectedComponent[] {
  const nodeById = new Map<string, IndexedLayoutNode>();
  const neighborsById = new Map<string, string[]>();

  for (const node of nodes) {
    nodeById.set(node.id, node);
    neighborsById.set(node.id, []);
  }

  for (const edge of edges) {
    if (edge.source === edge.target) {
      continue;
    }
    neighborsById.get(edge.source)?.push(edge.target);
    neighborsById.get(edge.target)?.push(edge.source);
  }

  const visited = new Set<string>();
  const componentIndexByNodeId = new Map<string, number>();
  const components: ConnectedComponent[] = [];

  for (const startNode of nodes) {
    if (visited.has(startNode.id)) {
      continue;
    }

    const componentIndex = components.length;
    const queue: string[] = [startNode.id];
    visited.add(startNode.id);
    const componentNodes: IndexedLayoutNode[] = [];

    for (let head = 0; head < queue.length; head++) {
      const currentId = queue[head];
      const currentNode = nodeById.get(currentId);
      if (currentNode != null) {
        componentNodes.push(currentNode);
        componentIndexByNodeId.set(currentId, componentIndex);
      }
      const neighbors = neighborsById.get(currentId) ?? [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    componentNodes.sort((a, b) => a.order - b.order);
    components.push({
      order: componentIndex,
      nodes: componentNodes,
      edges: [],
    });
  }

  for (const edge of edges) {
    const componentIndex = componentIndexByNodeId.get(edge.source);
    if (componentIndex != null) {
      components[componentIndex].edges.push(edge);
    }
  }

  return components;
}

function layoutComponent(component: ConnectedComponent): ComponentLayout {
  if (component.nodes.length === 1) {
    const [onlyNode] = component.nodes;
    return {
      order: component.order,
      nodeCount: 1,
      width: onlyNode.width,
      height: onlyNode.height,
      positions: [{ id: onlyNode.id, x: 0, y: 0 }],
    };
  }

  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP_PX,
    ranksep: DAGRE_RANK_SEP_PX,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  for (const node of component.nodes) {
    dagreGraph.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }

  for (const edge of component.edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const rawPositions = component.nodes.map((node) => {
    const positioned = dagreGraph.node(node.id);
    if (positioned == null) {
      throw new Error(`Dagre omitted node: ${node.id}`);
    }
    const x = positioned.x - positioned.width / 2;
    const y = positioned.y - positioned.height / 2;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + positioned.width);
    maxY = Math.max(maxY, y + positioned.height);
    return { id: node.id, x, y };
  });

  return {
    order: component.order,
    nodeCount: component.nodes.length,
    width: maxX - minX,
    height: maxY - minY,
    positions: rawPositions.map(({ id, x, y }) => ({
      id,
      x: normalizeZero(x - minX),
      y: normalizeZero(y - minY),
    })),
  };
}

function packComponentLayouts(
  components: readonly ComponentLayout[],
): Map<string, DagreNodePosition> {
  const positionsById = new Map<string, DagreNodePosition>();
  if (components.length === 0) {
    return positionsById;
  }

  if (components.length === 1) {
    for (const position of components[0].positions) {
      positionsById.set(position.id, position);
    }
    return positionsById;
  }

  const sortedComponents = [...components].sort((a, b) => {
    const aIsMulti = a.nodeCount > 1;
    const bIsMulti = b.nodeCount > 1;
    if (aIsMulti !== bIsMulti) {
      return aIsMulti ? -1 : 1;
    }
    if (a.nodeCount !== b.nodeCount) {
      return b.nodeCount - a.nodeCount;
    }
    return a.order - b.order;
  });

  let totalPaddedArea = 0;
  let maxComponentWidth = 0;
  for (const component of sortedComponents) {
    totalPaddedArea +=
      (component.width + DAGRE_RANK_SEP_PX) *
      (component.height + DAGRE_NODE_SEP_PX);
    maxComponentWidth = Math.max(maxComponentWidth, component.width);
  }

  const targetRowWidth = Math.max(
    maxComponentWidth,
    Math.sqrt(totalPaddedArea * COMPONENT_GRID_ASPECT_RATIO),
  );

  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const component of sortedComponents) {
    if (cursorX > 0 && cursorX + component.width / 2 > targetRowWidth) {
      cursorX = 0;
      cursorY += rowHeight + DAGRE_NODE_SEP_PX;
      rowHeight = 0;
    }

    for (const position of component.positions) {
      positionsById.set(position.id, {
        id: position.id,
        x: normalizeZero(position.x + cursorX),
        y: normalizeZero(position.y + cursorY),
      });
    }

    cursorX += component.width + DAGRE_RANK_SEP_PX;
    rowHeight = Math.max(rowHeight, component.height);
  }

  return positionsById;
}

/**
 * Runs Dagre per connected component using only serializable graph geometry,
 * packs disconnected components and isolated tables into a 2D shelf layout,
 * and returns top-left node positions.
 */
export function getDagrePositions(
  request: DagreLayoutRequest,
): DagreNodePosition[] {
  const nodeIds = new Set<string>();
  const validatedNodes: IndexedLayoutNode[] = request.nodes.map(
    (node, index) => {
      if (nodeIds.has(node.id)) {
        throw new Error(`Duplicate Dagre node: ${node.id}`);
      }
      nodeIds.add(node.id);
      return {
        id: node.id,
        order: index,
        width: assertDimension(node.width, `width for node ${node.id}`),
        height: assertDimension(node.height, `height for node ${node.id}`),
      };
    },
  );

  for (const edge of request.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(
        `Dagre edge references an unknown node: ${edge.source} -> ${edge.target}`,
      );
    }
  }

  if (validatedNodes.length === 0) {
    return [];
  }

  const components = partitionConnectedComponents(
    validatedNodes,
    request.edges,
  );
  const packedPositionsById = packComponentLayouts(
    components.map(layoutComponent),
  );

  return validatedNodes.map((node) => {
    const positioned = packedPositionsById.get(node.id);
    if (positioned == null) {
      throw new Error(`Dagre omitted node: ${node.id}`);
    }
    return positioned;
  });
}

export function applyDagrePositions(
  nodes: readonly SchemaViewerFlowNode[],
  positions: readonly DagreNodePosition[],
): SchemaViewerFlowNode[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const positionsById = new Map<string, DagreNodePosition>();

  for (const position of positions) {
    if (!nodesById.has(position.id)) {
      throw new Error(`Dagre returned an unknown node: ${position.id}`);
    }
    if (positionsById.has(position.id)) {
      throw new Error(`Dagre returned a duplicate node: ${position.id}`);
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error(
        `Dagre returned an invalid position for node ${position.id}`,
      );
    }
    positionsById.set(position.id, position);
  }

  if (positionsById.size !== nodes.length) {
    throw new Error(
      `Dagre returned ${positionsById.size} positions for ${nodes.length} nodes`,
    );
  }

  return nodes.map((node) => {
    const position = positionsById.get(node.id);
    if (position == null) {
      throw new Error(`Dagre omitted node: ${node.id}`);
    }
    return {
      ...node,
      position: { x: position.x, y: position.y },
      style: {
        ...node.style,
        opacity: 1,
      },
    };
  });
}

/** Runs the same Dagre calculation synchronously for fallback and tests. */
export function layoutWithDagre(
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): SchemaViewerFlowNode[] {
  return applyDagrePositions(
    nodes,
    getDagrePositions(getDagreLayoutRequest(nodes, edges)),
  );
}

import { useMemo } from "react";

import type { FlatTreeNode, NodeId, TreeNodeData } from "../types";

/** Options for flattening hierarchical tree data */
export interface UseTreeFlattenOptions<TData extends TreeNodeData> {
  /** Root-level tree data */
  data: TData[];
  /** Function to get children of a node */
  getChildren: (node: TData) => TData[] | undefined | null;
  /** Function to get unique ID of a node */
  getNodeId: (node: TData) => NodeId;
  /** Set of currently expanded node IDs */
  expandedIds: Set<NodeId>;
  /** Override default hasChildren detection (for lazy-loaded nodes) */
  isExpandable?: (node: TData) => boolean;
  /** Mark nodes as disabled (non-interactive) */
  isDisabled?: (node: TData) => boolean;
  /** Set of node IDs currently loading children */
  loadingIds?: Set<NodeId>;
}

/** Result of flattening tree data for rendering */
export interface UseTreeFlattenResult<TData extends TreeNodeData> {
  /** Flattened array of visible nodes (respects expansion state) */
  flatNodes: FlatTreeNode<TData>[];
  /** Map for O(1) node lookup by ID */
  nodeById: Map<NodeId, FlatTreeNode<TData>>;
  /** All node IDs in tree (including collapsed branches) */
  allNodeIds: Set<NodeId>;
}

interface FlattenContext<TData extends TreeNodeData> {
  getChildren: (node: TData) => TData[] | undefined | null;
  getNodeId: (node: TData) => NodeId;
  expandedIds: Set<NodeId>;
  isExpandable?: (node: TData) => boolean;
  isDisabled?: (node: TData) => boolean;
  loadingIds?: Set<NodeId>;
  allNodeIds: Set<NodeId>;
  flatIndex: number;
}

function flattenTree<TData extends TreeNodeData>(
  nodes: TData[],
  context: FlattenContext<TData>,
  depth: number,
  parentId: NodeId | null,
): FlatTreeNode<TData>[] {
  const result: FlatTreeNode<TData>[] = [];
  const {
    getChildren,
    getNodeId,
    expandedIds,
    isExpandable,
    isDisabled,
    loadingIds,
    allNodeIds,
  } = context;

  for (const node of nodes) {
    const id = getNodeId(node);
    const children = getChildren(node);
    const hasChildren = isExpandable
      ? isExpandable(node)
      : Boolean(children && children.length > 0);
    const isExpanded = hasChildren && expandedIds.has(id);
    const isLoading = loadingIds?.has(id) ?? false;
    const disabled = isDisabled?.(node) ?? false;

    allNodeIds.add(id);

    const flatNode: FlatTreeNode<TData> = {
      data: node,
      id,
      depth,
      index: context.flatIndex++,
      parentId,
      hasChildren,
      isExpanded,
      isLoading,
      isDisabled: disabled,
    };

    result.push(flatNode);

    if (children && children.length > 0) {
      if (isExpanded) {
        result.push(...flattenTree(children, context, depth + 1, id));
      } else {
        collectAllNodeIds(children, context);
      }
    }
  }

  return result;
}

function collectAllNodeIds<TData extends TreeNodeData>(
  nodes: TData[],
  context: FlattenContext<TData>,
): void {
  const { getChildren, getNodeId, allNodeIds } = context;

  for (const node of nodes) {
    const id = getNodeId(node);
    allNodeIds.add(id);

    const children = getChildren(node);
    if (children && children.length > 0) {
      collectAllNodeIds(children, context);
    }
  }
}

/**
 * Flattens hierarchical tree data into a linear array for virtualized rendering.
 * Only includes visible nodes (children of expanded parents).
 * Also collects all node IDs (including collapsed) for expandAll operations.
 */
export function useTreeFlatten<TData extends TreeNodeData>({
  data,
  getChildren,
  getNodeId,
  expandedIds,
  isExpandable,
  isDisabled,
  loadingIds,
}: UseTreeFlattenOptions<TData>): UseTreeFlattenResult<TData> {
  return useMemo(() => {
    const allNodeIds = new Set<NodeId>();
    const context: FlattenContext<TData> = {
      getChildren,
      getNodeId,
      expandedIds,
      isExpandable,
      isDisabled,
      loadingIds,
      allNodeIds,
      flatIndex: 0,
    };

    const flatNodes = flattenTree(data, context, 0, null);

    const nodeById = new Map<NodeId, FlatTreeNode<TData>>();
    for (const node of flatNodes) {
      nodeById.set(node.id, node);
    }

    return { flatNodes, nodeById, allNodeIds };
  }, [
    data,
    getChildren,
    getNodeId,
    expandedIds,
    isExpandable,
    isDisabled,
    loadingIds,
  ]);
}

/** Returns all descendant IDs of a given node (excluding the node itself) */
export function getAllDescendantIds<TData extends TreeNodeData>(
  nodeId: NodeId,
  data: TData[],
  getChildren: (node: TData) => TData[] | undefined | null,
  getNodeId: (node: TData) => NodeId,
): NodeId[] {
  const ids: NodeId[] = [];

  function collect(nodes: TData[]) {
    for (const node of nodes) {
      const id = getNodeId(node);
      ids.push(id);
      const children = getChildren(node);
      if (children && children.length > 0) {
        collect(children);
      }
    }
  }

  function findAndCollect(nodes: TData[]): boolean {
    for (const node of nodes) {
      const id = getNodeId(node);
      if (id === nodeId) {
        const children = getChildren(node);
        if (children && children.length > 0) {
          collect(children);
        }
        return true;
      }
      const children = getChildren(node);
      if (children && findAndCollect(children)) {
        return true;
      }
    }
    return false;
  }

  findAndCollect(data);
  return ids;
}

/** Returns IDs of all leaf nodes (nodes without children) in the tree */
export function getAllLeafIds<TData extends TreeNodeData>(
  data: TData[],
  getChildren: (node: TData) => TData[] | undefined | null,
  getNodeId: (node: TData) => NodeId,
): NodeId[] {
  const ids: NodeId[] = [];

  function collect(nodes: TData[]) {
    for (const node of nodes) {
      const children = getChildren(node);
      if (!children || children.length === 0) {
        ids.push(getNodeId(node));
      } else {
        collect(children);
      }
    }
  }

  collect(data);
  return ids;
}

/** Finds a node by ID anywhere in the tree (depth-first search) */
export function findNodeInTree<TData extends TreeNodeData>(
  nodeId: NodeId,
  data: TData[],
  getChildren: (node: TData) => TData[] | undefined | null,
  getNodeId: (node: TData) => NodeId,
): TData | undefined {
  for (const node of data) {
    if (getNodeId(node) === nodeId) {
      return node;
    }
    const children = getChildren(node);
    if (children) {
      const found = findNodeInTree(nodeId, children, getChildren, getNodeId);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";

import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import {
  getNode,
  getTreemapNodeId,
} from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  NodeId,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";

interface TreemapNavigation {
  viewRootId: NodeId | null;
  viewRootIdRef: MutableRefObject<NodeId | null>;
  setViewRoot: (id: NodeId | null) => void;
}

export function useTreemapNavigation(
  tree: TreemapTree | null,
): TreemapNavigation {
  const [viewRootId, setViewRootId] = useState<NodeId | null>(null);
  const viewRootIdRef = useRef<NodeId | null>(null);
  const viewRootKeyRef = useRef<string | null>(null);
  const treeRef = useLatest(tree);

  const setViewRoot = useCallback(
    (id: NodeId | null) => {
      viewRootIdRef.current = id;
      const node = id != null ? getNode(id, treeRef.current ?? []) : null;
      viewRootKeyRef.current = node != null ? getTreemapNodeKey(node) : null;
      setViewRootId(id);
    },
    [treeRef],
  );

  useEffect(() => {
    const drilledKey = viewRootKeyRef.current;
    if (drilledKey == null) {
      return;
    }
    const nodes = tree ?? [];
    const index = nodes.findIndex(
      (node) => getTreemapNodeKey(node) === drilledKey,
    );
    const nextId = index === -1 ? null : getTreemapNodeId(index);
    if (nextId !== viewRootIdRef.current) {
      setViewRoot(nextId);
    }
  }, [tree, setViewRoot]);

  return { viewRootId, viewRootIdRef, setViewRoot };
}

import type { Viewport } from "@xyflow/react";
import { useCallback, useEffect, useRef } from "react";

import type { SchemaViewerFlowNode } from "../types";
import {
  type SettledViewport,
  type ViewportSize,
  getNodeIdsInViewportWindow,
  isViewportInWindow,
} from "../utils/viewport-window";

const DETAIL_OVERSCAN_VIEWPORTS = 1;

type UseSchemaViewerDetailsArgs = {
  nodes: SchemaViewerFlowNode[];
  forcedNodeIds: ReadonlySet<string>;
};

type StoreListener = () => void;

type NodeDetailsStore = {
  getSnapshot: () => boolean;
  subscribe: (listener: StoreListener) => () => void;
};

export type SchemaViewerDetailsStore = {
  forNode: (nodeId: string) => NodeDetailsStore;
  getDetailedNodeIds: () => ReadonlySet<string>;
  isDetailed: (nodeId: string) => boolean;
  setDetailedNodeIds: (nodeIds: ReadonlySet<string>) => void;
  subscribe: (nodeId: string, listener: StoreListener) => () => void;
};

export function createSchemaViewerDetailsStore(): SchemaViewerDetailsStore {
  let detailedNodeIds: ReadonlySet<string> = new Set();
  const listenersByNodeId = new Map<string, Set<StoreListener>>();
  const nodeStores = new Map<string, NodeDetailsStore>();
  const subscribe = (nodeId: string, listener: StoreListener) => {
    const listeners = listenersByNodeId.get(nodeId) ?? new Set();
    listeners.add(listener);
    listenersByNodeId.set(nodeId, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        listenersByNodeId.delete(nodeId);
      }
    };
  };

  return {
    forNode: (nodeId) => {
      let nodeStore = nodeStores.get(nodeId);
      if (nodeStore == null) {
        nodeStore = {
          getSnapshot: () => detailedNodeIds.has(nodeId),
          subscribe: (listener) => subscribe(nodeId, listener),
        };
        nodeStores.set(nodeId, nodeStore);
      }
      return nodeStore;
    },
    getDetailedNodeIds: () => detailedNodeIds,
    isDetailed: (nodeId) => detailedNodeIds.has(nodeId),
    setDetailedNodeIds: (nextNodeIds) => {
      const changedNodeIds = new Set<string>();
      for (const nodeId of detailedNodeIds) {
        if (!nextNodeIds.has(nodeId)) {
          changedNodeIds.add(nodeId);
        }
      }
      for (const nodeId of nextNodeIds) {
        if (!detailedNodeIds.has(nodeId)) {
          changedNodeIds.add(nodeId);
        }
      }
      if (changedNodeIds.size === 0) {
        return;
      }

      detailedNodeIds = new Set(nextNodeIds);
      for (const nodeId of changedNodeIds) {
        for (const listener of listenersByNodeId.get(nodeId) ?? []) {
          listener();
        }
      }
    },
    subscribe,
  };
}

function getBufferedNodeIds(
  nodes: readonly SchemaViewerFlowNode[],
  settledViewport: SettledViewport,
) {
  return getNodeIdsInViewportWindow(
    nodes,
    settledViewport,
    DETAIL_OVERSCAN_VIEWPORTS,
  );
}

export function useSchemaViewerDetails({
  nodes,
  forcedNodeIds,
}: UseSchemaViewerDetailsArgs) {
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const forcedNodeIdsRef = useRef(forcedNodeIds);
  forcedNodeIdsRef.current = forcedNodeIds;
  const settledViewportRef = useRef<SettledViewport | null>(null);
  const bufferedNodeIdsRef = useRef<ReadonlySet<string>>(new Set());
  const focusedNodeIdRef = useRef<string | null>(null);
  const detailsStoreRef = useRef<SchemaViewerDetailsStore | null>(null);
  if (detailsStoreRef.current == null) {
    detailsStoreRef.current = createSchemaViewerDetailsStore();
  }
  const detailsStore = detailsStoreRef.current;

  const updateStore = useCallback(() => {
    const next = new Set(bufferedNodeIdsRef.current);
    for (const nodeId of forcedNodeIdsRef.current) {
      next.add(nodeId);
    }
    if (focusedNodeIdRef.current != null) {
      next.add(focusedNodeIdRef.current);
    }
    detailsStore.setDetailedNodeIds(next);
  }, [detailsStore]);

  useEffect(() => {
    updateStore();
  }, [forcedNodeIds, updateStore]);

  const settleViewport = useCallback(
    (viewport: Viewport, size: ViewportSize) => {
      const settledViewport = { viewport, size };
      settledViewportRef.current = settledViewport;
      bufferedNodeIdsRef.current = getBufferedNodeIds(
        nodesRef.current,
        settledViewport,
      );
      focusedNodeIdRef.current = null;
      updateStore();
    },
    [updateStore],
  );

  const recomputeDetails = useCallback(() => {
    const settledViewport = settledViewportRef.current;
    if (settledViewport == null) {
      return;
    }
    bufferedNodeIdsRef.current = getBufferedNodeIds(
      nodesRef.current,
      settledViewport,
    );
    updateStore();
  }, [updateStore]);

  /** Whether every table visible at `viewport` is in the detailed window. */
  const isViewportDetailed = useCallback(
    (viewport: Viewport, size: ViewportSize) => {
      const settledViewport = settledViewportRef.current;
      return (
        settledViewport != null &&
        isViewportInWindow(
          { viewport, size },
          settledViewport,
          DETAIL_OVERSCAN_VIEWPORTS,
        )
      );
    },
    [],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      focusedNodeIdRef.current = nodeId;
      updateStore();
    },
    [updateStore],
  );

  return {
    get detailedNodeIds() {
      return detailsStore.getDetailedNodeIds();
    },
    detailsStore,
    settleViewport,
    recomputeDetails,
    isViewportDetailed,
    focusNode,
  };
}

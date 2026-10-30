import type { Viewport } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";
import {
  type SettledViewport,
  type ViewportSize,
  getNodeIdsInViewportWindow,
  getRenderedGraph,
  isViewportInWindow,
} from "../utils/viewport-window";

// Overscan is measured in viewports, but a viewport at low zoom covers far
// more tables, so it shrinks with zoom: 0.75 viewports at the 0.3 minimum zoom,
// 2 viewports at zoom 1.
const MIN_OVERSCAN_VIEWPORTS = 0.75;
const MAX_OVERSCAN_VIEWPORTS = 2;
const NO_NODE_IDS: ReadonlySet<string> = new Set();

function getOverscanViewports(zoom: number) {
  return Math.min(
    MAX_OVERSCAN_VIEWPORTS,
    Math.max(MIN_OVERSCAN_VIEWPORTS, MAX_OVERSCAN_VIEWPORTS * zoom),
  );
}

type UseRenderedGraphArgs = {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
  forcedNodeIds: ReadonlySet<string>;
};

function areSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * Keeps the full logical graph out of React Flow: only nodes near the last
 * settled viewport and any pending camera destination (plus forced nodes) are
 * rendered, along with every edge touching them. Nothing renders before the
 * first settle or camera move. Membership changes only at those boundaries,
 * never during movement, so panning does no per-frame mount or unmount work.
 */
export function useRenderedGraph({
  nodes,
  edges,
  forcedNodeIds,
}: UseRenderedGraphArgs) {
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const forcedNodeIdsRef = useRef(forcedNodeIds);
  forcedNodeIdsRef.current = forcedNodeIds;
  const settledViewportRef = useRef<SettledViewport | null>(null);
  const destinationsRef = useRef<SettledViewport[]>([]);
  const [renderedNodeIds, setRenderedNodeIds] =
    useState<ReadonlySet<string>>(NO_NODE_IDS);

  const recomputeWindow = useCallback(() => {
    const windows = [...destinationsRef.current];
    if (settledViewportRef.current != null) {
      windows.push(settledViewportRef.current);
    }
    const windowNodeIds = new Set(forcedNodeIdsRef.current);
    for (const viewportWindow of windows) {
      const overscan = getOverscanViewports(viewportWindow.viewport.zoom);
      for (const nodeId of getNodeIdsInViewportWindow(
        nodesRef.current,
        viewportWindow,
        overscan,
      )) {
        windowNodeIds.add(nodeId);
      }
    }
    setRenderedNodeIds((current) =>
      areSetsEqual(current, windowNodeIds) ? current : windowNodeIds,
    );
  }, []);

  useEffect(() => {
    recomputeWindow();
  }, [forcedNodeIds, recomputeWindow]);

  const settleViewport = useCallback(
    (viewport: Viewport, size: ViewportSize) => {
      settledViewportRef.current = { viewport, size };
      destinationsRef.current = [];
      recomputeWindow();
    },
    [recomputeWindow],
  );

  /** Renders a camera destination in addition to the current window. */
  const includeViewport = useCallback(
    (viewport: Viewport, size: ViewportSize) => {
      destinationsRef.current.push({ viewport, size });
      recomputeWindow();
    },
    [recomputeWindow],
  );

  /** Whether everything visible at `viewport` is in the settled window. */
  const isViewportRendered = useCallback(
    (viewport: Viewport, size: ViewportSize) => {
      const settledViewport = settledViewportRef.current;
      return (
        settledViewport != null &&
        isViewportInWindow(
          { viewport, size },
          settledViewport,
          getOverscanViewports(settledViewport.viewport.zoom),
        )
      );
    },
    [],
  );

  const renderedGraph = useMemo(
    () => getRenderedGraph(nodes, edges, renderedNodeIds),
    [nodes, edges, renderedNodeIds],
  );

  return {
    renderedNodes: renderedGraph.nodes,
    renderedEdges: renderedGraph.edges,
    settleViewport,
    recomputeWindow,
    includeViewport,
    isViewportRendered,
  };
}

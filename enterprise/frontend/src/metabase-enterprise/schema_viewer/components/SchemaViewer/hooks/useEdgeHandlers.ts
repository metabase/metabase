import type { Dispatch, SetStateAction } from "react";
import { useCallback, useRef } from "react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

const EMPTY_FIELD_IDS: Set<number> = new Set();

type UseEdgeHandlersArgs = {
  zoomToNode: (nodeId: string) => void;
  setNodes: Dispatch<SetStateAction<SchemaViewerFlowNode[]>>;
  setEdges: Dispatch<SetStateAction<SchemaViewerFlowEdge[]>>;
};

export function useEdgeHandlers({
  zoomToNode,
  setNodes,
  setEdges,
}: UseEdgeHandlersArgs) {
  const lastEdgeSideRef = useRef<Map<string, "source" | "target">>(new Map());

  // Store information on current selected field ids on each node to avoid extracting it
  // from React Flow store through `useStore()` which is much more expensive (fires on every canvas interaction).
  const setSelectedFieldIds = useCallback(
    (globalIds: Set<number>) => {
      setNodes((prev) =>
        prev.map((node) => {
          const next = new Set<number>();
          if (globalIds.size > 0) {
            for (const f of node.data.fields) {
              if (globalIds.has(f.id)) {
                next.add(f.id);
              }
            }
          }
          const existing = node.data.selectedFieldIds;
          if (next.size === 0 && existing.size === 0) {
            return node;
          }
          if (next.size === existing.size) {
            let same = true;
            for (const id of next) {
              if (!existing.has(id)) {
                same = false;
                break;
              }
            }
            if (same) {
              return node;
            }
          }
          return {
            ...node,
            data: { ...node.data, selectedFieldIds: next },
          };
        }),
      );
    },
    [setNodes],
  );

  const handleEdgeClick = useCallback(
    (_event: React.MouseEvent, edge: SchemaViewerFlowEdge) => {
      setSelectedFieldIds(getEdgeFieldIds(edge));

      if (!edge.selected) {
        return;
      }
      const previousSide = lastEdgeSideRef.current.get(edge.id);
      const nextSide: "source" | "target" =
        previousSide === "source" ? "target" : "source";
      lastEdgeSideRef.current.set(edge.id, nextSide);
      const targetNodeId = nextSide === "source" ? edge.source : edge.target;
      zoomToNode(targetNodeId);
    },
    [zoomToNode, setSelectedFieldIds],
  );

  const clearEdgeSelection = useCallback(() => {
    setEdges((currentEdges) =>
      currentEdges.map((e) => (e.selected ? { ...e, selected: false } : e)),
    );
    setSelectedFieldIds(EMPTY_FIELD_IDS);
  }, [setEdges, setSelectedFieldIds]);

  return { handleEdgeClick, clearEdgeSelection };
}

function getEdgeFieldIds(edge: SchemaViewerFlowEdge): Set<number> {
  const ids = new Set<number>();
  addFieldIdFromHandle(ids, edge.sourceHandle);
  addFieldIdFromHandle(ids, edge.targetHandle);
  return ids;
}

function addFieldIdFromHandle(
  ids: Set<number>,
  handle: string | null | undefined,
) {
  if (handle == null) {
    return;
  }
  const match = /^field-(\d+)/.exec(handle);
  if (match) {
    ids.add(Number(match[1]));
  }
}

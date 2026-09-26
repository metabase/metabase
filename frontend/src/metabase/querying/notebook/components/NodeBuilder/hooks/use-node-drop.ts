import { type XYPosition, useReactFlow, useStoreApi } from "@xyflow/react";
import {
  type Dispatch,
  type DragEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { trackNodeBuilderBlockAdded } from "../analytics";
import { NODE_TYPE_DRAG_TYPE } from "../components/NodeDock";
import { centeredPosition, createBlankNode, recenterDropped } from "../graph";
import type { BuilderNode, DockNodeType } from "../types";

const DOCK_TYPES: readonly DockNodeType[] = [
  "table",
  "join",
  "expression",
  "filter",
  "summarize",
  "sort",
  "limit",
];

type Options = {
  nodes: BuilderNode[];
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
};

// Dropping a chip from the dock lands a blank block centred under the cursor.
export function useNodeDrop({ nodes, setNodes }: Options) {
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const store = useStoreApi();
  // Cursor points of dropped blocks that still need exact centring once
  // react-flow reports their real size.
  const pendingCentersRef = useRef(new Map<string, XYPosition>());

  const onDragOver = useCallback((event: DragEvent) => {
    if (event.dataTransfer.types.includes(NODE_TYPE_DRAG_TYPE)) {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      const dropped = event.dataTransfer.getData(NODE_TYPE_DRAG_TYPE);
      const nodeType = DOCK_TYPES.find((type) => type === dropped);
      if (!nodeType) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const cursor = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const node = createBlankNode(
        nodeType,
        centeredPosition(nodeType, cursor),
      );
      pendingCentersRef.current.set(node.id, cursor);
      setNodes((prevNodes) => [...prevNodes, node]);
      trackNodeBuilderBlockAdded(nodeType, "drag");
    },
    [screenToFlowPosition, setNodes],
  );

  // The keyboard route: a blank block lands in the middle of the viewport.
  const addBlock = useCallback(
    (nodeType: DockNodeType) => {
      const { width, height } = store.getState();
      const { x, y, zoom } = getViewport();
      const center = { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
      const node = createBlankNode(
        nodeType,
        centeredPosition(nodeType, center),
      );
      pendingCentersRef.current.set(node.id, center);
      setNodes((prevNodes) => [...prevNodes, node]);
      trackNodeBuilderBlockAdded(nodeType, "click");
    },
    [store, getViewport, setNodes],
  );

  // The estimate used at drop time is close; once the block is measured, put
  // its real centre exactly under where the cursor was.
  useEffect(() => {
    const pending = pendingCentersRef.current;
    if (pending.size === 0) {
      return;
    }
    const recentered = recenterDropped(nodes, pending);
    if (recentered) {
      setNodes(recentered);
    }
  }, [nodes, setNodes]);

  return { onDragOver, onDrop, addBlock };
}

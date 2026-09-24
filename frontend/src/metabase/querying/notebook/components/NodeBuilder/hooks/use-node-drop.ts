import { type XYPosition, useReactFlow } from "@xyflow/react";
import {
  type Dispatch,
  type DragEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { NODE_TYPE_DRAG_TYPE } from "../components/NodeDock";
import {
  type LadderKind,
  TAIL_KINDS,
  type TailKind,
  centeredPosition,
  createExpressionNode,
  createFilterNode,
  createJoinNode,
  createTableNode,
  recenterDropped,
} from "../graph";
import type { BuilderNode, DockNodeType } from "../types";

function isTailKind(type: DockNodeType): type is TailKind {
  return TAIL_KINDS.some((kind) => kind === type);
}

const DOCK_TYPES: readonly DockNodeType[] = [
  "table",
  "join",
  "expression",
  "filter",
  ...TAIL_KINDS,
];

type Options = {
  nodes: BuilderNode[];
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  addTailBlock: (kind: LadderKind) => void;
};

// Dropping a chip from the dock: free blocks land centred under the cursor,
// tail blocks slot into the ladder on their own.
export function useNodeDrop({ nodes, setNodes, addTailBlock }: Options) {
  const { screenToFlowPosition } = useReactFlow();
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
      if (isTailKind(nodeType)) {
        addTailBlock(nodeType);
        return;
      }
      const cursor = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const position = centeredPosition(nodeType, cursor);
      const node =
        nodeType === "join"
          ? createJoinNode(position)
          : nodeType === "filter"
            ? createFilterNode(position)
            : nodeType === "expression"
              ? createExpressionNode(position)
              : createTableNode(position, null);
      pendingCentersRef.current.set(node.id, cursor);
      setNodes((prevNodes) => [...prevNodes, node]);
    },
    [screenToFlowPosition, addTailBlock, setNodes],
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

  return { onDragOver, onDrop };
}

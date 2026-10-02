import { useReactFlow } from "@xyflow/react";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type CompiledGraph,
  FIT_VIEW_OPTIONS,
  type NodeSize,
  layoutNodes,
} from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

// A fresh seed stays hidden until its query has compiled into the blocks and
// they have been laid out with their real sizes; this cap reveals it anyway.
const SETTLE_CAP_MS = 2000;

type Options = {
  nodes: BuilderNode[];
  edgesRef: MutableRefObject<BuilderEdge[]>;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  compiled: CompiledGraph;
  compiledKeyRef: MutableRefObject<string | null>;
};

// Hides the canvas while a fresh seed waits for its startup layout, so the
// first paint is the settled graph rather than blocks shifting into place.
// The seed is placed from size estimates; the blocks only take their final
// size once the query has compiled into them. Right after that render, their
// sizes are read from the DOM, the graph laid out, fitted and shown.
export function useStartupLayout({
  nodes,
  edgesRef,
  setNodes,
  compiled,
  compiledKeyRef,
}: Options) {
  const { fitView } = useReactFlow();
  const [isSettled, setIsSettled] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pendingKeyRef = useRef<string | null>(null);
  const capRef = useRef<number | null>(null);

  const clearCap = useCallback(() => {
    if (capRef.current != null) {
      window.clearTimeout(capRef.current);
      capRef.current = null;
    }
  }, []);
  useEffect(() => clearCap, [clearCap]);

  const beginSettling = useCallback(
    (structureKey: string) => {
      pendingKeyRef.current = structureKey;
      setIsSettled(false);
      clearCap();
      capRef.current = window.setTimeout(() => {
        pendingKeyRef.current = null;
        setIsSettled(true);
      }, SETTLE_CAP_MS);
    },
    [clearCap],
  );

  useLayoutEffect(() => {
    const key = pendingKeyRef.current;
    if (key == null || key !== compiledKeyRef.current) {
      return;
    }
    const sizes = measureBlocks(canvasRef.current);
    if (nodes.some((node) => !sizes.has(node.id))) {
      return;
    }
    pendingKeyRef.current = null;
    setNodes((prevNodes) => layoutNodes(prevNodes, edgesRef.current, sizes));
    window.requestAnimationFrame(() => {
      fitView({ ...FIT_VIEW_OPTIONS, duration: 0 }).then(() => {
        clearCap();
        setIsSettled(true);
      });
    });
  }, [compiled, compiledKeyRef, nodes, edgesRef, setNodes, fitView, clearCap]);

  return { isSettled, canvasRef, beginSettling };
}

// Reads every block's rendered size straight from the DOM, so a layout can
// run in the same frame as the render that changed what the blocks show.
function measureBlocks(root: HTMLElement | null): Map<string, NodeSize> {
  const sizes = new Map<string, NodeSize>();
  root
    ?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")
    .forEach((element) => {
      const id = element.dataset.id;
      if (id && element.offsetWidth > 0 && element.offsetHeight > 0) {
        sizes.set(id, {
          width: element.offsetWidth,
          height: element.offsetHeight,
        });
      }
    });
  return sizes;
}

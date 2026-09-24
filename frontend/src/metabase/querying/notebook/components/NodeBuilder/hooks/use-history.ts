import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";

import { type Graph, graphKey } from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

const HISTORY_LIMIT = 50;

type Options = {
  nodes: BuilderNode[];
  edges: BuilderEdge[];
  structureKey: string;
  setNodes: Dispatch<SetStateAction<BuilderNode[]>>;
  setEdges: Dispatch<SetStateAction<BuilderEdge[]>>;
  isEnabled: boolean;
};

// Undo history: a snapshot is taken whenever the graph's structure changes
// and at the start of every drag, never for fold state. `committed` is the
// last state the history knows about, so restoring one does not record it.
export function useHistory({
  nodes,
  edges,
  structureKey,
  setNodes,
  setEdges,
  isEnabled,
}: Options) {
  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);
  const historyRef = useRef<{ past: Graph[]; future: Graph[] }>({
    past: [],
    future: [],
  });
  const committedRef = useRef<{ key: string; snapshot: Graph } | null>(null);
  const [size, setSize] = useState({ past: 0, future: 0 });
  const syncSize = useCallback(() => {
    const { past, future } = historyRef.current;
    setSize({ past: past.length, future: future.length });
  }, []);

  const record = useCallback(
    (snapshot: Graph) => {
      const history = historyRef.current;
      history.past = [...history.past.slice(-(HISTORY_LIMIT - 1)), snapshot];
      history.future = [];
      syncSize();
    },
    [syncSize],
  );

  useEffect(() => {
    const committed = committedRef.current;
    const current = { key: structureKey, snapshot: { nodes, edges } };
    if (committed == null || committed.key === structureKey) {
      // First state, or the same structure (a drag, a fold): keep the latest positions.
      committedRef.current = current;
      return;
    }
    record(committed.snapshot);
    committedRef.current = current;
  }, [structureKey, nodes, edges, record]);

  const restore = useCallback(
    (snapshot: Graph) => {
      committedRef.current = {
        key: graphKey(snapshot.nodes, snapshot.edges),
        snapshot,
      };
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    [setNodes, setEdges],
  );

  const undo = useCallback(() => {
    const history = historyRef.current;
    const previous = history.past.pop();
    if (!previous || !committedRef.current) {
      return;
    }
    history.future.push(committedRef.current.snapshot);
    restore(previous);
    syncSize();
  }, [restore, syncSize]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    const next = history.future.pop();
    if (!next || !committedRef.current) {
      return;
    }
    history.past.push(committedRef.current.snapshot);
    restore(next);
    syncSize();
  }, [restore, syncSize]);

  // A move is undoable too: remember where things were when the drag began.
  const recordDragStart = useCallback(() => {
    record({ nodes: nodesRef.current, edges: edgesRef.current });
  }, [record, nodesRef, edgesRef]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== "z"
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isEnabled, undo, redo]);

  return {
    canUndo: size.past > 0,
    canRedo: size.future > 0,
    undo,
    redo,
    recordDragStart,
  };
}

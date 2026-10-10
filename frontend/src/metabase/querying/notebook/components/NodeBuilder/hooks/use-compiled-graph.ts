import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";

import { selectMetadataProvider } from "metabase/metadata-store";
import { useStore } from "metabase/redux";
import type { DatabaseId } from "metabase-types/api";

import {
  type CompiledGraph,
  EMPTY_COMPILED_GRAPH,
  compileGraph,
  graphKey,
} from "../graph";
import type { BuilderEdge, BuilderNode } from "../types";

// Compiles the graph whenever its structure changes, never on a drag frame.
// `compiledKeyRef` says which structure the current result came from.
export function useCompiledGraph(nodes: BuilderNode[], edges: BuilderEdge[]) {
  const store = useStore();
  const nodesRef = useLatest(nodes);
  const edgesRef = useLatest(edges);
  const getMetadataProvider = useCallback(
    (databaseId: DatabaseId) =>
      selectMetadataProvider(store.getState(), databaseId),
    [store],
  );

  const structureKey = useMemo(() => graphKey(nodes, edges), [nodes, edges]);
  const compiledKeyRef = useRef<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledGraph>(EMPTY_COMPILED_GRAPH);

  useEffect(() => {
    compiledKeyRef.current = structureKey;
    setCompiled(
      compileGraph(nodesRef.current, edgesRef.current, getMetadataProvider),
    );
  }, [structureKey, nodesRef, edgesRef, getMetadataProvider]);

  return { compiled, structureKey, compiledKeyRef };
}

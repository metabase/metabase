import { MiniMap, useEdges } from "@xyflow/react";
import { useCallback, useMemo } from "react";

// 0 connections → light gray; most-connected node → dark gray.
const MIN_LIGHTNESS = 32;
const MAX_LIGHTNESS = 88;

/**
 * MiniMap that shades each node by its edge count: hubs (more connections)
 * read as darker gray on the map, leaves as light gray. Counts are
 * normalized against the most-connected node so the gradient always uses
 * the full range regardless of schema size.
 */
export function SchemaViewerMinimap() {
  const edges = useEdges();

  const connectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of edges) {
      counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
      if (edge.target !== edge.source) {
        counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
      }
    }
    return counts;
  }, [edges]);

  const maxConnectionCount = useMemo(() => {
    let max = 0;
    for (const count of connectionCounts.values()) {
      if (count > max) {
        max = count;
      }
    }
    return max;
  }, [connectionCounts]);

  const nodeColor = useCallback(
    (node: { id: string }) => {
      const count = connectionCounts.get(node.id) ?? 0;
      const ratio = maxConnectionCount > 0 ? count / maxConnectionCount : 0;
      const lightness = MAX_LIGHTNESS - ratio * (MAX_LIGHTNESS - MIN_LIGHTNESS);
      return `hsl(0, 0%, ${lightness}%)`;
    },
    [connectionCounts, maxConnectionCount],
  );

  return (
    <MiniMap
      position="bottom-right"
      pannable
      zoomable={false}
      nodeColor={nodeColor}
    />
  );
}

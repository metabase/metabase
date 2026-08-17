import { MiniMap, useEdges } from "@xyflow/react";
import { useCallback, useMemo } from "react";

import { useColorScheme } from "metabase/ui";

const LIGHT_LEAF_LIGHTNESS = 88;
const LIGHT_HUB_LIGHTNESS = 32;
const DARK_LEAF_LIGHTNESS = 28;
const DARK_HUB_LIGHTNESS = 80;

/**
 * MiniMap shades each node by its edge count: hubs (more connections)
 * read as the more-prominent end of the gradient, leaves as the less-prominent
 * end. Counts are normalized against the most-connected node.
 */
export function SchemaViewerMinimap() {
  const edges = useEdges();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

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

  const maxConnectionCount = useMemo(
    () => Math.max(0, ...connectionCounts.values()),
    [connectionCounts],
  );

  const nodeColor = useCallback(
    (node: { id: string }) => {
      const count = connectionCounts.get(node.id) ?? 0;
      const ratio = maxConnectionCount > 0 ? count / maxConnectionCount : 0;
      const leaf = isDark ? DARK_LEAF_LIGHTNESS : LIGHT_LEAF_LIGHTNESS;
      const hub = isDark ? DARK_HUB_LIGHTNESS : LIGHT_HUB_LIGHTNESS;
      const lightness = leaf + ratio * (hub - leaf);
      return `hsl(0, 0%, ${lightness}%)`;
    },
    [connectionCounts, maxConnectionCount, isDark],
  );

  return (
    <MiniMap
      position="bottom-right"
      pannable
      zoomable={false}
      nodeColor={nodeColor}
      bgColor={
        isDark
          ? "var(--mb-color-background_page-secondary)"
          : "var(--mb-color-background_surface-primary)"
      }
      maskStrokeColor="var(--mb-color-border-neutral)"
    />
  );
}

import { MiniMap, useEdges } from "@xyflow/react";
import { useCallback, useMemo } from "react";

import { useColorScheme } from "metabase/ui";

// Light mode: 0 connections → light gray (88), hub → dark gray (32) so hubs
// stand out against the near-white minimap background.
// Dark mode: flipped — leaves blend into the dark background, hubs read as
// near-white. The two endpoints are mirrored so the gradient covers the same
// perceptual range in both schemes.
const LIGHT_LEAF_LIGHTNESS = 88;
const LIGHT_HUB_LIGHTNESS = 32;
const DARK_LEAF_LIGHTNESS = 28;
const DARK_HUB_LIGHTNESS = 80;

/**
 * MiniMap that shades each node by its edge count: hubs (more connections)
 * read as the more-prominent end of the gradient, leaves as the less-prominent
 * end. Counts are normalized against the most-connected node so the gradient
 * always uses the full range regardless of schema size.
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
          ? "var(--mb-color-background-secondary)"
          : "var(--mb-color-background)"
      }
      maskStrokeColor="var(--mb-color-border)"
    />
  );
}

import type { LayoutEdge, NeighborPlacement } from "./types";

/**
 * Creates bidirectional neighbor lookup for incremental placement, preserving
 * edge direction as a preferred left/right placement hint.
 */
export function buildAdjacency(
  edges: LayoutEdge[],
): Map<string, NeighborPlacement[]> {
  const adjacency = new Map<string, NeighborPlacement[]>();
  for (const edge of edges) {
    const sourceNeighbors = adjacency.get(edge.source);
    const targetNeighbors = adjacency.get(edge.target);
    const sourcePlacement = {
      neighborId: edge.target,
      preferredSide: "left" as const,
    };
    const targetPlacement = {
      neighborId: edge.source,
      preferredSide: "right" as const,
    };
    if (sourceNeighbors == null) {
      adjacency.set(edge.source, [sourcePlacement]);
    } else {
      sourceNeighbors.push(sourcePlacement);
    }
    if (targetNeighbors == null) {
      adjacency.set(edge.target, [targetPlacement]);
    } else {
      targetNeighbors.push(targetPlacement);
    }
  }
  return adjacency;
}

/**
 * Splits edges incident to the focal node into incoming and outgoing neighbor
 * sets. Self-referential edges are dropped so the focal node never appears in
 * its own neighbor columns.
 */
export function partitionFocalNeighbors(
  focalId: string,
  edges: LayoutEdge[],
): { incomingIds: Set<string>; outgoingIds: Set<string> } {
  const incomingIds = new Set<string>();
  const outgoingIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source === focalId && edge.target !== focalId) {
      outgoingIds.add(edge.target);
    } else if (edge.target === focalId && edge.source !== focalId) {
      incomingIds.add(edge.source);
    }
  }
  return { incomingIds, outgoingIds };
}

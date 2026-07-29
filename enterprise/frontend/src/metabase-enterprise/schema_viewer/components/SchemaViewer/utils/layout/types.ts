export type LayoutEdge = { source: string; target: string };

export type NodeDimensions = {
  width: number;
  height: number;
};

export type PlacementSide = "left" | "right";

export type NeighborPlacement = {
  neighborId: string;
  preferredSide: PlacementSide;
};

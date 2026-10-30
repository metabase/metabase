export type LayoutEdge = { source: string; target: string };

export type DagreLayoutNode = {
  id: string;
  width: number;
  height: number;
};

export type DagreLayoutRequest = {
  nodes: readonly DagreLayoutNode[];
  edges: readonly LayoutEdge[];
};

export type DagreNodePosition = {
  id: string;
  x: number;
  y: number;
};

export type DagreWorkerRequest = {
  generation: number;
  graph: DagreLayoutRequest;
};

export type DagreWorkerResponse =
  | {
      type: "success";
      generation: number;
      positions: DagreNodePosition[];
    }
  | { type: "error"; generation: number; message: string };

export type NodeDimensions = {
  width: number;
  height: number;
};

export type PlacementSide = "left" | "right";

export type NeighborPlacement = {
  neighborId: string;
  preferredSide: PlacementSide;
};

export const ROW_HEIGHT = 48;
export const HEADER_HEIGHT = 56;
export const NODE_WIDTH = 320;

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1;

const DEFAULT_ZOOM = 0.3;
export const FIT_VIEW_OPTIONS = {
  minZoom: DEFAULT_ZOOM,
  maxZoom: DEFAULT_ZOOM,
};

/**
 * Dagre layout algorithm parameters used for spacing nodes in the SchemaViewer's graph layout:
 *
 * DAGRE_NODE_SEP - Minimum horizontal separation between nodes on the same rank (row). Controls how far apart adjacent tables are positioned horizontally.
 * DAGRE_RANK_SEP - Minimum vertical separation between ranks (rows). Controls the vertical spacing between different levels of the dependency graph.
 */
export const DAGRE_NODE_SEP = 60;
export const DAGRE_RANK_SEP = 120;

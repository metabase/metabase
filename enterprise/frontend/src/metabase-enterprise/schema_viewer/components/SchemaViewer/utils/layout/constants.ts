/**
 * Dagre's algorithm is the default positioning algorithm used by React Flow.
 * The algorithm parameters used for spacing nodes in the SchemaViewer's graph layout:
 *
 * DAGRE_NODE_SEP_PX - Minimum horizontal separation between nodes on the same rank (row). Controls how far apart adjacent tables are positioned horizontally.
 * DAGRE_RANK_SEP_PX - Minimum vertical separation between ranks (rows). Controls the vertical spacing between different levels of the dependency graph.
 */
export const DAGRE_NODE_SEP_PX = 60;
export const DAGRE_RANK_SEP_PX = 120;

// Minimum visual gap to leave between a newly-placed node and any existing one
export const COLLISION_PADDING_PX = 20;
// Vertical step used when walking to find a free slot for an incoming node
export const COLLISION_Y_STEP_PX = 100;
// Maximum number of Y steps to try before giving up on a given column
export const MAX_COLLISION_Y_STEPS = 40;

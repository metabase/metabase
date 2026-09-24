// Ids, stage, viewport and colour tokens shared by the canvas.

export const RESULT_NODE_ID = "result";

export const DRAG_HANDLE_CLASS = "node-builder-drag-handle";

// The canvas always describes the first stage of the query.
export const STAGE_INDEX = 0;

export const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1, duration: 300 };

// One hue per block kind; the values live on the builder root in NodeBuilder.module.css.
export const SOURCE_COLOR = "var(--builder-table)";

export const TABLE_COLOR = "var(--builder-table)";

export const JOIN_COLOR = "var(--builder-join)";

export const EXPRESSION_COLOR = "var(--builder-expression)";

export const FILTER_COLOR = "var(--builder-filter)";

export const SUMMARIZE_COLOR = "var(--builder-summarize)";

export const SORT_COLOR = "var(--builder-sort)";

export const LIMIT_COLOR = "var(--builder-limit)";

export const RESULT_COLOR = "var(--builder-result)";

export const ROW_HEIGHT_PX = 48;
export const HEADER_HEIGHT_PX = 56;
export const NODE_WIDTH_PX = 320;

// (if this value changes, update the same constant in e2e/test/scenarios/data-studio/schema-viewer.cy.spec.ts)
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1;
// Shared by React Flow's initial `fitView` and `fitGraph`, so a late initial
// fit lands on the same viewport instead of overriding the graph fit.
export const FIT_VIEW_OPTIONS = {
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  padding: 0.1,
};

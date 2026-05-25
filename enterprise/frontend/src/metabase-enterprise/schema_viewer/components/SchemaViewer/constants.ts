export const ROW_HEIGHT_PX = 48;
export const HEADER_HEIGHT_PX = 56;
export const NODE_WIDTH_PX = 320;

const DEFAULT_ZOOM = 0.3;
// (if this value changes, update the same constant in e2e/test/scenarios/schema-viewer/schema-viewer.cy.spec.ts)
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 1;
export const FIT_VIEW_OPTIONS = {
  minZoom: DEFAULT_ZOOM,
  maxZoom: DEFAULT_ZOOM,
};

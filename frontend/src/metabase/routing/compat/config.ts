/**
 * React Router migration feature flags
 *
 * These flags control the gradual migration from React Router v3 to v7.
 * Set to `true` to enable v7 behavior for each feature.
 */

// Master flag - when true, enables React Router v7 for the entire app
export const USE_REACT_ROUTER_V7 = false;

// Granular flags for incremental migration
export const USE_V7_NAVIGATION = USE_REACT_ROUTER_V7;
export const USE_V7_LOCATION = USE_REACT_ROUTER_V7;
export const USE_V7_PARAMS = USE_REACT_ROUTER_V7;
export const USE_V7_ROUTE_GUARDS = USE_REACT_ROUTER_V7;

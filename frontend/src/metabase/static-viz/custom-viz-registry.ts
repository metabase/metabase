// Registry for custom visualization plugins registered via IIFE bundles in the GraalJS static-viz context.
// keyed by "custom:<identifier>"
export const customVizRegistry: Map<string, any> = new Map();

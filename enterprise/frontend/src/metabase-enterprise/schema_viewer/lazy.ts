/**
 * The schema viewer page, in its own chunk. It renders the schema with xyflow
 * and dagre, which nothing else in the initial bundle needs. The route file
 * turns this loader into a route-level `lazy`, and the prefetch registration
 * reuses it, so both sides always name the same module.
 */
export const loadSchemaViewerPage = () =>
  import(/* webpackChunkName: "schema-viewer" */ "./pages/SchemaViewerPage");

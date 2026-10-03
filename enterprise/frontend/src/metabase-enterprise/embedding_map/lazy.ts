/**
 * The embedding map page, in its own chunk. It renders the projection with
 * umap-js and ECharts, which nothing else in the initial bundle needs.
 */
export const loadEmbeddingMapPage = () =>
  import(/* webpackChunkName: "embedding-map" */ "./pages/EmbeddingMapPage");

// NOTE: do not statically re-export the EChartsRenderer *value* here. It is
// loaded lazily (see ResponsiveEChartsRenderer) so that echarts lands in its
// own async chunk; a static `export *` would pull it back into the initial
// bundle. Types are erased at build time, so re-exporting them is safe.
export type { EChartsRendererProps } from "./EChartsRenderer";
export type { ResponsiveEChartsRendererProps } from "./ResponsiveEChartsRenderer";
export { prefetchEChartsRenderer } from "./lazy";
export { ResponsiveEChartsRenderer } from "./ResponsiveEChartsRenderer.styled";

import { lazy } from "react";

// echarts (its chart classes, components, the core SVG renderer and zrender) is
// the single largest dependency in the app bundle. Loading EChartsRenderer
// lazily moves all of it into its own async chunk so it is not part of the
// initial page load.
//
// This lives in its own module (rather than next to ResponsiveEChartsRenderer)
// to avoid a module-load-order cycle: ResponsiveEChartsRenderer and its styled
// component import each other, so importing the prefetch helper from there would
// force that pair to evaluate in the wrong order.
const importEChartsRenderer = () =>
  import(
    /* webpackChunkName: "echarts-renderer" */
    "metabase/visualizations/components/EChartsRenderer/EChartsRenderer"
  );

// Start downloading the echarts chunk ahead of render — e.g. as soon as a chart
// card mounts, while its data query is still in flight — so the library loads
// in parallel with the data instead of only after the chart is ready to render.
// rspack de-duplicates the request, so this shares the same chunk as the lazy
// component below.
export const prefetchEChartsRenderer = () => {
  void importEChartsRenderer();
};

export const LazyEChartsRenderer = lazy(() =>
  importEChartsRenderer().then((module) => ({
    default: module.EChartsRenderer,
  })),
);

import { Suspense, forwardRef, lazy, useLayoutEffect } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { LoadingSpinner } from "metabase/common/components/LoadingSpinner";
import { isNumber } from "metabase/utils/types";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

// echarts (its chart classes, components, the core SVG renderer and zrender) is
// the single largest dependency in the app bundle. Loading EChartsRenderer
// lazily moves all of it into its own async chunk so it is not part of the
// initial page load. `webpackPrefetch` lets the browser warm that chunk during
// idle time after the app shell loads, so by the time a chart needs to render
// the code is usually already available.
const EChartsRenderer = lazy(() =>
  import(
    /* webpackPrefetch: true */
    /* webpackChunkName: "echarts-renderer" */
    "metabase/visualizations/components/EChartsRenderer/EChartsRenderer"
  ).then((module) => ({ default: module.EChartsRenderer })),
);

export interface ResponsiveEChartsRendererProps extends React.PropsWithChildren<EChartsRendererProps> {
  onResize?: (width: number, height: number) => void;
}

const ResponsiveEChartsRendererInner = forwardRef<
  HTMLDivElement,
  ResponsiveEChartsRendererProps
>(function ResponsiveEChartsRendererBase(
  {
    onResize,
    width,
    height,
    children,
    ...echartsRenderedProps
  }: ResponsiveEChartsRendererProps,
  ref,
) {
  useLayoutEffect(() => {
    if (isNumber(width) && isNumber(height)) {
      onResize?.(width, height);
    }
  }, [width, height, onResize]);

  if (!width || !height) {
    return null;
  }

  return (
    <ResponsiveEChartsRendererStyled>
      <Suspense fallback={<LoadingSpinner />}>
        <EChartsRenderer
          ref={ref}
          {...echartsRenderedProps}
          width={width}
          height={height}
        />
      </Suspense>
      {children}
    </ResponsiveEChartsRendererStyled>
  );
});

export const ResponsiveEChartsRendererExplicitSize =
  ExplicitSize<ResponsiveEChartsRendererProps>({
    wrapped: true,
    refreshMode: "debounceLeading",
  })(ResponsiveEChartsRendererInner);

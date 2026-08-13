import { Suspense, forwardRef, useLayoutEffect } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { Flex } from "metabase/ui";
import { isNumber } from "metabase/utils/types";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";
import { LazyEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/lazy";
import { getChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton";
import type { VisualizationDisplay } from "metabase-types/api";

export interface ResponsiveEChartsRendererProps extends React.PropsWithChildren<EChartsRendererProps> {
  onResize?: (width: number, height: number) => void;
  // Display type of the chart, used to show a matching skeleton while the
  // echarts chunk is loading.
  display?: VisualizationDisplay;
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
    display,
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
      <Suspense
        fallback={
          <Flex h="100%" w="100%" direction="column">
            {getChartSkeletonImage(
              display === "boxplot"
                ? "scatter"
                : display === "combo"
                  ? "bar"
                  : display,
            )}
          </Flex>
        }
      >
        <LazyEChartsRenderer
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

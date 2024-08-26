import { forwardRef, useEffect } from "react";

import ExplicitSize from "metabase/components/ExplicitSize";
import { isNumber } from "metabase/lib/types";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

export interface ResponsiveEChartsRendererProps extends EChartsRendererProps {
  onResize: (width: number, height: number) => void;
}

const _ResponsiveEChartsRenderer = forwardRef<
  HTMLDivElement,
  ResponsiveEChartsRendererProps
>(function _ResponsiveEChartsRenderer(
  {
    onResize,
    width,
    height,
    ...echartsRenderedProps
  }: ResponsiveEChartsRendererProps,
  ref,
) {
  useEffect(() => {
    if (isNumber(width) && isNumber(height)) {
      onResize(width, height);
    }
  }, [width, height, onResize]);

  if (!width || !height) {
    return null;
  }

  return (
    <ResponsiveEChartsRendererStyled>
      <EChartsRenderer
        ref={ref}
        {...echartsRenderedProps}
        width={width}
        height={height}
      />
    </ResponsiveEChartsRendererStyled>
  );
});

export const ResponsiveEChartsRenderer =
  ExplicitSize<ResponsiveEChartsRendererProps>({
    wrapped: true,
    refreshMode: "debounceLeading",
  })(_ResponsiveEChartsRenderer);

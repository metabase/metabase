import { useEffect } from "react";

import ExplicitSize from "metabase/components/ExplicitSize";
import { isNumber } from "metabase/lib/types";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

export interface ResponsiveEChartsRendererProps extends EChartsRendererProps {
  onResize: (width: number, height: number) => void;
  // We don't use the `style` prop, but it's needed to prevent a type error due
  // to how types work within `ExplicitSize`
  style: any;
}

export const ResponsiveEChartsRenderer =
  ExplicitSize<ResponsiveEChartsRendererProps>({
    wrapped: true,
    refreshMode: "debounceLeading",
  })(_ResponsiveEChartsRenderer);

function _ResponsiveEChartsRenderer({
  onResize,
  width,
  height,
  ...echartsRenderedProps
}: ResponsiveEChartsRendererProps) {
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
        {...echartsRenderedProps}
        width={width}
        height={height}
      />
    </ResponsiveEChartsRendererStyled>
  );
}

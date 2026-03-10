import { forwardRef, useLayoutEffect } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import { isNumber } from "metabase/lib/types";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

export interface ResponsiveEChartsRendererProps
  extends React.PropsWithChildren<EChartsRendererProps> {
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
      <EChartsRenderer
        ref={ref}
        {...echartsRenderedProps}
        width={width}
        height={height}
      />
      {children}
    </ResponsiveEChartsRendererStyled>
  );
});

export const ResponsiveEChartsRendererExplicitSize =
  ExplicitSize<ResponsiveEChartsRendererProps>({
    wrapped: true,
    refreshMode: "debounceLeading",
  })(ResponsiveEChartsRendererInner);

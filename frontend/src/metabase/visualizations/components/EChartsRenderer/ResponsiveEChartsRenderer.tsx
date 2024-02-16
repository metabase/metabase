import { useEffect } from "react";
import ExplicitSize from "metabase/components/ExplicitSize";
import type { EChartsRendererProps } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { EChartsRenderer } from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";
import { ResponsiveEChartsRendererStyled } from "metabase/visualizations/components/EChartsRenderer/ResponsiveEChartsRenderer.styled";

interface ResponsiveEChartsRendererProps extends EChartsRendererProps {
  onResize: (width: number, height: number) => void;
  width: number;
  height: number;
}

export const ResponsiveEChartsRenderer = ExplicitSize({
  wrapped: true,
  refreshMode: "debounceLeading",
  selector: false,
})(
  ({
    onResize,
    width,
    height,
    ...echartsRenderedProps
  }: ResponsiveEChartsRendererProps) => {
    useEffect(() => {
      if (width != null && height != null) {
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
  },
);

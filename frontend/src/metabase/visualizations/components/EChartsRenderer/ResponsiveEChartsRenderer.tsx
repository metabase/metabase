import { forwardRef, useLayoutEffect } from "react";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";
import { isNumber } from "metabase/utils/types";
import {
  EChartsRenderer,
  type EChartsRendererProps,
} from "metabase/visualizations/components/EChartsRenderer/EChartsRenderer";

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
    <Box pos="absolute" inset={0}>
      <EChartsRenderer
        ref={ref}
        {...echartsRenderedProps}
        width={width}
        height={height}
      />
      {children}
    </Box>
  );
});

const ResponsiveEChartsRendererExplicitSize = ExplicitSize<
  ResponsiveEChartsRendererProps & { className?: string }
>({
  wrapped: true,
  refreshMode: "debounceLeading",
})(ResponsiveEChartsRendererInner);

type ResponsiveEChartsRendererOuterProps = Omit<
  ResponsiveEChartsRendererProps,
  "width" | "height"
>;

export const ResponsiveEChartsRenderer = forwardRef<
  HTMLDivElement,
  ResponsiveEChartsRendererOuterProps
>(function ResponsiveEChartsRenderer(props, ref) {
  return (
    <ResponsiveEChartsRendererExplicitSize
      {...props}
      className={CS.fullHeight}
      ref={ref}
    />
  );
});

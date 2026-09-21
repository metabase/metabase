import type { CSSProperties, ReactNode } from "react";

import { FONT_SIZE_SEGMENT_LABEL } from "./constants";

interface Props {
  children: ReactNode;
  position: [number, number];
  style?: CSSProperties;
}

export const GaugeSegmentLabel = ({
  children,
  position: [x, y],
  style,
}: Props) => (
  <text
    // fill + textAnchor are set as attributes (not inline style) so they survive
    // the html2canvas cssText copy on export; var() fill is resolved by resolveSvgVarPaint.
    fill="var(--mb-color-text-secondary)"
    textAnchor={Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end"}
    style={{
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}px`,
      // shift text in the lower half down a bit
      transform:
        y > 0 ? `translate(0,${FONT_SIZE_SEGMENT_LABEL / 2}px)` : undefined,
      ...style,
    }}
    x={x}
    y={y}
  >
    {children}
  </text>
);

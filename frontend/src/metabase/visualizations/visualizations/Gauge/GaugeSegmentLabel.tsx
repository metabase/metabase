import type { CSSProperties, ReactNode } from "react";

import { FONT_SIZE_SEGMENT_LABEL } from "./constants";
import { getLabelBaselineShift, getLabelTextAnchor } from "./utils";

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
    textAnchor={getLabelTextAnchor(x)}
    style={{
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}px`,
      transform:
        y > 0 ? `translate(0,${getLabelBaselineShift(y)}px)` : undefined,
      ...style,
    }}
    x={x}
    y={y}
  >
    {children}
  </text>
);

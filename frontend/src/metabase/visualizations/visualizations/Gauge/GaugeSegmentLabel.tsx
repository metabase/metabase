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
    style={{
      fill: "var(--mb-color-text-secondary)",
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}px`,
      textAnchor: Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end",
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

import { t } from "ttag";

import type { RenderingContext } from "metabase/viz-core";

const RECT = {
  height: 40,
  width: 210,
};

interface DataOutOfRangeOverlayProps {
  width: number;
  height: number;
  renderingContext: RenderingContext;
}

export const DataOutOfRangeOverlay = ({
  width,
  height,
  renderingContext,
}: DataOutOfRangeOverlayProps) => (
  <g>
    <rect
      x={width / 2 - RECT.width / 2}
      y={height / 2 - RECT.height / 2}
      fill={renderingContext.getColor("background_page-primary")}
      stroke={renderingContext.getColor("border-neutral")}
      strokeWidth="1"
      width={RECT.width}
      height={RECT.height}
      rx="8"
    />
    <text x="50%" y={height / 2 + 4} textAnchor="middle">
      {t`Every data point is out of range`}
    </text>
  </g>
);

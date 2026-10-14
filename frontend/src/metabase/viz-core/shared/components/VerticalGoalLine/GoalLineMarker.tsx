import { useState } from "react";

import { CHART_STYLE } from "../../../echarts/cartesian/constants/style";
import type { GoalMarkerStyle } from "../../types/style";

interface GoalLineMarkerProps {
  x: number;
  y: number;
  style: GoalMarkerStyle;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
}

export const GoalLineMarker = ({
  x,
  y,
  style,
  onMouseEnter,
  onMouseLeave,
}: GoalLineMarkerProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const {
    outerRingRadius,
    innerRingRadius,
    ringWidth,
    backgroundRadius,
    shadowSpread,
    hitAreaRadius,
  } = CHART_STYLE.goalLine.marker;

  const handleMouseEnter = (event: React.MouseEvent) => {
    setIsHovered(true);
    onMouseEnter?.(event);
  };

  const handleMouseLeave = (event: React.MouseEvent) => {
    setIsHovered(false);
    onMouseLeave?.(event);
  };

  return (
    <g
      data-testid="goal-line-marker"
      transform={`translate(${x}, ${y})`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <g pointerEvents="none">
        <circle r={backgroundRadius + shadowSpread} fill={style.shadowColor} />
        <circle r={backgroundRadius} fill={style.backgroundColor} />
        {isHovered && (
          <circle r={backgroundRadius} fill={style.hoverBackgroundColor} />
        )}
        <circle
          r={outerRingRadius}
          fill="none"
          stroke={style.iconColor}
          strokeWidth={ringWidth}
        />
        <circle
          r={innerRingRadius}
          fill="none"
          stroke={style.iconColor}
          strokeWidth={ringWidth}
        />
      </g>
      <circle r={hitAreaRadius} fill={style.iconColor} opacity={0} />
    </g>
  );
};

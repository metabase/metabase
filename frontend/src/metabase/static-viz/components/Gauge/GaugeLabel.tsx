import OutlinedText from "metabase/static-viz/components/Text/OutlinedText";

import type { Position, TextAnchor } from "./types";

interface GaugeLabelProps {
  fill: string;
  stroke: string;
  fontSize: number;
  position: Position;
  label: string;
  textAnchor?: TextAnchor;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function GaugeLabel({
  fill,
  stroke,
  fontSize,
  position,
  label,
  textAnchor = "middle",
}: GaugeLabelProps) {
  return (
    <OutlinedText
      fill={fill}
      fontWeight={700}
      fontSize={fontSize}
      stroke={stroke}
      strokeWidth={fontSize / 4}
      x={position[0]}
      y={position[1]}
      textAnchor={textAnchor}
      verticalAnchor="middle"
    >
      {label}
    </OutlinedText>
  );
}

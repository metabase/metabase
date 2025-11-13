import type { TickRendererProps } from "@visx/axis";
import { Text } from "@visx/text";

interface WrappedYAxisTickProps extends TickRendererProps {
  maxWidth: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fill: string;
}

export const WrappedYAxisTick = ({
  formattedValue,
  x,
  y,
  maxWidth,
  fontFamily,
  fontSize,
  fontWeight,
  fill,
}: WrappedYAxisTickProps) => {
  return (
    <Text
      x={x}
      y={y}
      width={maxWidth}
      verticalAnchor="middle"
      textAnchor="end"
      fontSize={fontSize}
      fontFamily={fontFamily}
      fontWeight={fontWeight}
      fill={fill}
      style={{ userSelect: "none" }}
    >
      {formattedValue}
    </Text>
  );
};

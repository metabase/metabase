import { Line } from "@visx/shape";
import { Text } from "../../Text";

const LABEL_OFFSET = 5;

interface GoalLineProps {
  label: string;
  color: string;
  x1: number;
  x2: number;
  y: number;
}

export const GoalLine = ({ y, x1, x2, label, color }: GoalLineProps) => {
  return (
    <>
      <Text y={y - LABEL_OFFSET} textAnchor="end" x={x2} fill={color}>
        {label}
      </Text>
      <Line
        strokeDasharray={4}
        stroke={color}
        strokeWidth={2}
        y1={y}
        y2={y}
        x1={x1}
        x2={x2}
      />
    </>
  );
};

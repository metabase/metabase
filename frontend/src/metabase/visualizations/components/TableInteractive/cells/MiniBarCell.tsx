import Color from "color";

import {
  BaseCell,
  type CellAlign,
  type CellFormatter,
} from "metabase/data-grid";
import { alpha, color } from "metabase/lib/colors";

const BAR_HEIGHT = 8;
const BAR_WIDTH = 70;
const BORDER_RADIUS = 3;
const LABEL_MIN_WIDTH = 30;

export interface MiniBarCellProps<TValue> {
  value: TValue;
  extent: [number, number];
  formatter: CellFormatter<TValue>;
  backgroundColor?: string;
  align?: CellAlign;
  rowIndex: number;
  columnId: string;
  isStatic?: boolean;
}

export const MiniBarCell = <TValue,>({
  value,
  extent: [min, max],
  formatter,
  backgroundColor,
  align,
  rowIndex,
  columnId,
  isStatic = false,
}: MiniBarCellProps<TValue>) => {
  if (typeof value !== "number") {
    return null;
  }

  const hasNegative = min < 0;
  const isNegative = value < 0;
  const barPercent =
    (Math.abs(value) / Math.max(Math.abs(min), Math.abs(max))) * 100;
  const barColor = isNegative ? color("error") : color("brand");

  const barStyle = !hasNegative
    ? {
        width: barPercent + "%",
        left: 0,
        borderRadius: BORDER_RADIUS,
      }
    : isNegative
      ? {
          width: barPercent / 2 + "%",
          right: "50%",
          borderTopRightRadius: 0,
          borderBottomRightRadius: 0,
          borderTopLeftRadius: BORDER_RADIUS,
          borderBottomLeftRadius: BORDER_RADIUS,
        }
      : {
          width: barPercent / 2 + "%",
          left: "50%",
          borderTopLeftRadius: 0,
          borderBottomLeftRadius: 0,
          borderTopRightRadius: BORDER_RADIUS,
          borderBottomRightRadius: BORDER_RADIUS,
        };

  if (isStatic) {
    // @TSP TODO - This logic has issues
    const svgBarStyle = !hasNegative
      ? {
          width: barPercent + "%",
          x: 0,
          rx: BORDER_RADIUS,
        }
      : isNegative
        ? {
            width: barPercent / 2 + "%",
            x: BAR_WIDTH / 2 - (barPercent / 2 / 100) * BAR_WIDTH,
            rx: BORDER_RADIUS,
            rxLeft: 0,
          }
        : {
            width: barPercent / 2 + "%",
            x: BAR_WIDTH / 2,
            rx: BORDER_RADIUS,
            rxRight: 0,
          };

    return (
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="24">
        <g transform="translate(0,0)">
          {/* Text value */}
          <text
            x="30"
            y="16"
            style={{
              fontWeight: 700,
              textAnchor: "end",
              fontSize: "12px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {formatter(value, rowIndex, columnId)}
          </text>
          {/* Bar container */}
          <g transform="translate(34,8)">
            {/* Background bar */}
            <rect
              width={BAR_WIDTH}
              height={BAR_HEIGHT}
              rx={BORDER_RADIUS}
              fill={Color(barColor).hex()}
              fillOpacity="0.2"
            />
            {/* Progress bar */}
            <rect
              width={svgBarStyle.width}
              height={BAR_HEIGHT}
              rx={svgBarStyle.rx}
              fill={Color(barColor).hex()}
              x={svgBarStyle.x}
              y={0}
            />
            {/* Center line for negative values */}
            {hasNegative && (
              <line
                x1={BAR_WIDTH / 2}
                y1={0}
                x2={BAR_WIDTH / 2}
                y2={BAR_HEIGHT}
                stroke={color("white")}
                strokeWidth="1"
              />
            )}
          </g>
        </g>
      </svg>
    );
  }

  return (
    <BaseCell
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        height: "100%",
        padding: "0 8px",
      }}
      backgroundColor={backgroundColor}
      align={align}
    >
      {/* TEXT VALUE */}
      <div
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 700,
          textAlign: "right",
          flex: 1,
          minWidth: LABEL_MIN_WIDTH,
        }}
      >
        {formatter(value, rowIndex, columnId)}
      </div>
      {/* OUTER CONTAINER BAR */}
      <div
        data-testid="mini-bar-container"
        style={{
          position: "relative",
          width: BAR_WIDTH,
          height: BAR_HEIGHT,
          backgroundColor: alpha(barColor, 0.2),
          borderRadius: BORDER_RADIUS,
          marginLeft: "4px",
        }}
      >
        {/* INNER PROGRESS BAR */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            backgroundColor: barColor,
            ...barStyle,
          }}
        />
        {/* CENTER LINE */}
        {hasNegative && (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              bottom: 0,
              borderLeft: `1px solid ${color("white")}`,
            }}
          />
        )}
      </div>
    </BaseCell>
  );
};

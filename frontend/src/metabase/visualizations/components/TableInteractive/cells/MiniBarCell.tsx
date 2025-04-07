import cx from "classnames";

import CS from "metabase/css/core/index.css";
import {
  BaseCell,
  type CellAlign,
  type CellFormatter,
} from "metabase/data-grid";
import { alpha, color } from "metabase/lib/colors";
import type { ColumnSettings } from "metabase-types/api";

import S from "./MiniBarCell.module.css";

const BAR_HEIGHT = 8;
const BAR_WIDTH = 70;
const BORDER_RADIUS = 3;

const LABEL_MIN_WIDTH = 30;

const resolveMax = (min: number, max: number, number_style: string) => {
  // For pure percent columns with values within [0, 1] use 1 as top range of minibar
  if (number_style === "percent" && min >= 0 && max <= 1) {
    return 1;
  }
  return max;
};

export interface MiniBarCellProps<TValue> {
  value: TValue;
  extent: [number, number];
  formatter: CellFormatter<TValue>;
  backgroundColor?: string;
  align?: CellAlign;
  rowIndex: number;
  columnId: string;
  columnSettings: ColumnSettings;
}

export const MiniBarCell = <TValue,>({
  value,
  extent: [min, max],
  formatter,
  backgroundColor,
  align,
  rowIndex,
  columnId,
  columnSettings,
}: MiniBarCellProps<TValue>) => {
  if (typeof value !== "number") {
    return null;
  }

  const hasNegative = min < 0;
  const isNegative = value < 0;
  const resolvedMax = resolveMax(min, max, columnSettings["number_style"]);
  const barPercent =
    (Math.abs(value) / Math.max(Math.abs(min), Math.abs(resolvedMax))) * 100;
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

  return (
    <BaseCell
      className={S.root}
      backgroundColor={backgroundColor}
      align={align}
    >
      <div className={S.minibarWrapper}>
        {/* TEXT VALUE */}
        <div
          className={cx(
            CS.textEllipsis,
            CS.textBold,
            CS.textRight,
            CS.flexFull,
          )}
          style={{ minWidth: LABEL_MIN_WIDTH }}
        >
          {formatter(value, rowIndex, columnId)}
        </div>
        {/* OUTER CONTAINER BAR */}
        <div
          data-testid="mini-bar-container"
          className={CS.ml1}
          style={{
            position: "relative",
            width: BAR_WIDTH,
            height: BAR_HEIGHT,
            backgroundColor: alpha(barColor, 0.2),
            borderRadius: BORDER_RADIUS,
          }}
        >
          {/* INNER PROGRESS BAR */}
          <div
            data-testid="mini-bar"
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
      </div>
    </BaseCell>
  );
};

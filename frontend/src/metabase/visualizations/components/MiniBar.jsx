import React from "react";

import colors, { alpha } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";

const BAR_HEIGHT = 8;
const BAR_WIDTH = 70;
const BORDER_RADIUS = 3;

const LABEL_MIN_WIDTH = 30;

const MiniBar = ({ value, extent: [min, max], options, cellHeight }) => {
  const hasNegative = min < 0;
  const isNegative = value < 0;
  const barPercent =
    Math.abs(value) / Math.max(Math.abs(min), Math.abs(max)) * 100;
  const barColor = isNegative ? colors["error"] : colors["brand"];

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
    <div className="flex align-center currentcolor justify-end relative">
      {/* TEXT VALUE */}
      <div
        className="text-ellipsis text-bold text-right flex-full"
        style={{ minWidth: LABEL_MIN_WIDTH }}
      >
        {formatValue(value, { ...options, jsx: true })}
      </div>
      {/* OUTER CONTAINER BAR */}
      <div
        className="ml1"
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
              borderLeft: `1px solid white`,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default MiniBar;

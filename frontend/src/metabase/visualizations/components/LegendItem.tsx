import cx from "classnames";
import { type MouseEvent, type MouseEventHandler, forwardRef } from "react";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { Ellipsified, Tooltip } from "metabase/ui";

import LegendS from "./Legend.module.css";
import { LegendItemDot } from "./legend/LegendItemDot";
import type { LegendTitle } from "./types";

interface LegendItemProps {
  title: LegendTitle;
  color: string;
  isMuted?: boolean;
  isVisible?: boolean;
  showTooltip?: boolean;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
  onToggleSeriesVisibility?: (event: MouseEvent) => void;
}

export const LegendItem = forwardRef<HTMLSpanElement, LegendItemProps>(
  function LegendItem(
    {
      title,
      color,
      isMuted = false,
      isVisible = true,
      showTooltip = true,
      onMouseEnter,
      onMouseLeave,
      onToggleSeriesVisibility,
    },
    ref,
  ) {
    return (
      <span
        ref={ref}
        data-testid="legend-item"
        className={cx(
          LegendS.LegendItem,
          { [LegendS.LegendItemMuted]: isMuted },
          CS.noDecoration,
          DashboardS.fullscreenNormalText,
          DashboardS.DashboardChartLegend,
          CS.flex,
          CS.alignCenter,
          CS.mr1,
        )}
        style={{
          overflowX: "hidden",
          flex: "0 1 auto",
          paddingLeft: "4px",
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Tooltip label={title} disabled={!showTooltip} arrowPosition="center">
          <LegendItemDot
            color={color}
            isVisible={isVisible}
            onClick={onToggleSeriesVisibility}
          />
        </Tooltip>
        <div
          className={cx(CS.flex, CS.alignCenter, CS.overflowHidden)}
          style={{ marginLeft: "4px" }}
        >
          <Ellipsified showTooltip={showTooltip}>{title}</Ellipsified>
        </div>
      </span>
    );
  },
);

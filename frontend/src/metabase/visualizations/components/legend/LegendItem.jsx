import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";

import {
  LegendItemLabel,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import { LegendItemDot } from "./LegendItemDot";

const propTypes = {
  item: PropTypes.object,
  dotSize: PropTypes.string,
  index: PropTypes.number,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  isInsidePopover: PropTypes.bool,
  isReversed: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onToggleSeriesVisibility: PropTypes.func,
};

const LegendItemInner = ({
  item,
  dotSize = "8px",
  index,
  isMuted,
  isVertical,
  isInsidePopover,
  isReversed,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
}) => {
  const handleDotClick = (event) => {
    onToggleSeriesVisibility?.(event, index);
  };

  const handleItemClick = (event) => {
    onSelectSeries && onSelectSeries(event, index, isReversed);
  };

  const handleItemMouseEnter = (event) => {
    onHoverChange && onHoverChange({ index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange && onHoverChange();
  };

  return (
    <LegendItemRoot isVertical={isVertical} data-testid="legend-item">
      <LegendItemLabel
        isMuted={isMuted}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        <LegendItemDot
          color={item.color}
          size={dotSize}
          isVisible={item.visible}
          onClick={onToggleSeriesVisibility && handleDotClick}
        />
        <LegendItemTitle
          className={cx(
            DashboardS.fullscreenNormalText,
            DashboardS.DashboardChartLegend,
          )}
          dotSize={dotSize}
          isInsidePopover={isInsidePopover}
          onClick={onSelectSeries && handleItemClick}
        >
          <Ellipsified>{item.name}</Ellipsified>
        </LegendItemTitle>
      </LegendItemLabel>
    </LegendItemRoot>
  );
};

LegendItemInner.propTypes = propTypes;

export const LegendItem = memo(LegendItemInner);

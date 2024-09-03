import cx from "classnames";
import PropTypes from "prop-types";
import { memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

import {
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";
import { LegendItemDot } from "./LegendItemDot";

const propTypes = {
  item: PropTypes.object,
  index: PropTypes.number,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  isInsidePopover: PropTypes.bool,
  isReversed: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onToggleSeriesVisibility: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendItem = ({
  item,
  index,
  isMuted,
  isVertical,
  isInsidePopover,
  isReversed,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
  onRemoveSeries,
}) => {
  const handleDotClick = event => {
    onToggleSeriesVisibility?.(event, index);
  };

  const handleItemClick = event => {
    onSelectSeries && onSelectSeries(event, index, isReversed);
  };

  const handleItemMouseEnter = event => {
    onHoverChange && onHoverChange({ index, element: event.currentTarget });
  };

  const handleItemMouseLeave = () => {
    onHoverChange && onHoverChange();
  };

  const handleRemoveClick = event => {
    onRemoveSeries && onRemoveSeries(event, index);
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
          isVisible={item.visible}
          onClick={onToggleSeriesVisibility && handleDotClick}
        />
        <LegendItemTitle
          className={cx(
            DashboardS.fullscreenNormalText,
            DashboardS.fullscreenNightText,
            EmbedFrameS.fullscreenNightText,
          )}
          isInsidePopover={isInsidePopover}
          onClick={onSelectSeries && handleItemClick}
        >
          <Ellipsified>{item.name}</Ellipsified>
        </LegendItemTitle>
      </LegendItemLabel>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);

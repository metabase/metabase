import cx from "classnames";
import PropTypes from "prop-types";
import { memo, useState } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import DashboardS from "metabase/css/dashboard.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";

import {
  EditableLegendItemTitle,
  LegendItemDot,
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemTitle,
} from "./LegendItem.styled";

const propTypes = {
  item: PropTypes.object,
  index: PropTypes.number,
  isMuted: PropTypes.bool,
  isVertical: PropTypes.bool,
  isReversed: PropTypes.bool,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onChangeSeriesName: PropTypes.func,
  onRemoveSeries: PropTypes.func,
};

const LegendItem = ({
  item,
  index,
  isMuted,
  isVertical,
  isReversed,
  onHoverChange,
  onSelectSeries,
  onChangeSeriesName,
  onRemoveSeries,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);

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

  const legendItemTitleClassNames = cx(
    DashboardS.fullscreenNormalText,
    DashboardS.fullscreenNightText,
    EmbedFrameS.fullscreenNightText,
  );

  return (
    <LegendItemRoot isVertical={isVertical} data-testid="legend-item">
      <LegendItemLabel
        isMuted={isMuted}
        onClick={onSelectSeries && !isEditingName && handleItemClick}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        <LegendItemDot color={item.color} />
        {onChangeSeriesName ? (
          <EditableLegendItemTitle
            className={legendItemTitleClassNames}
            initialValue={item.name}
            onFocus={() => setIsEditingName(true)}
            onBlur={() => setIsEditingName(false)}
            onChange={name => onChangeSeriesName(index, name)}
          />
        ) : (
          <LegendItemTitle className={legendItemTitleClassNames}>
            <Ellipsified>{item.name}</Ellipsified>
          </LegendItemTitle>
        )}
      </LegendItemLabel>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

LegendItem.propTypes = propTypes;

export default memo(LegendItem);

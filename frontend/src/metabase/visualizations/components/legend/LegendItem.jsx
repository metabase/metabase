import React, { memo, useCallback } from "react";
import {
  LegendItemDescription,
  LegendItemDot,
  LegendItemLabel,
  LegendItemRemoveIcon,
  LegendItemRoot,
  LegendItemSubtitle,
  LegendItemTitle,
} from "./LegendItem.styled";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";

type Props = {
  title: string | string[],
  index: number,
  color: string,
  description?: string,
  isMuted?: boolean,
  isVertical?: boolean,
  showDot?: boolean,
  showTitle?: boolean,
  showTooltip?: boolean,
  showDotTooltip?: boolean,
  classNameWidgets?: string,
  onHoverChange: ({ index: number, element: Element }) => void,
  onSelectSeries: (event: MouseEvent, index: number) => void,
  onRemoveSeries: (event: MouseEvent, index: number) => void,
};

const LegendItem = (props: Props) => {
  const {
    title,
    index,
    color,
    description,
    isMuted = false,
    isVertical = false,
    showDot = true,
    showTitle = true,
    showTooltip = false,
    showDotTooltip = false,
    classNameWidgets,
    onHoverChange,
    onSelectSeries,
    onRemoveSeries,
  } = props;

  const handleItemClick = useCallback(
    event => {
      onSelectSeries && onSelectSeries(event, index);
    },
    [index, onSelectSeries],
  );

  const handleItemMouseEnter = useCallback(
    event => {
      onHoverChange && onHoverChange({ index, element: event.currentTarget });
    },
    [index, onHoverChange],
  );

  const handleItemMouseLeave = useCallback(() => {
    onHoverChange && onHoverChange();
  }, [onHoverChange]);

  const handleRemoveClick = useCallback(
    event => {
      onRemoveSeries && onRemoveSeries(event, index);
    },
    [index, onRemoveSeries],
  );

  return (
    <LegendItemRoot isVertical={isVertical}>
      <LegendItemLabel
        isMuted={isMuted}
        onClick={onSelectSeries && handleItemClick}
        onMouseEnter={onHoverChange && handleItemMouseEnter}
        onMouseLeave={onHoverChange && handleItemMouseLeave}
      >
        {showDot && (
          <Tooltip
            tooltip={getTitleText(title)}
            isEnabled={showTooltip && showDotTooltip}
          >
            <LegendItemDot color={color} />
          </Tooltip>
        )}
        {showTitle && (
          <LegendItemTitle showDot={showDot}>
            {isVertical && getTitleNodes(title)}
            {!isVertical && (
              <Ellipsified showTooltip={showTooltip}>
                {getTitleNodes(title)}
              </Ellipsified>
            )}
            {description && (
              <LegendItemDescription>
                <Tooltip tooltip={description} maxWidth="22em">
                  <Icon className={classNameWidgets} name="info" />
                </Tooltip>
              </LegendItemDescription>
            )}
          </LegendItemTitle>
        )}
      </LegendItemLabel>
      {onRemoveSeries && <LegendItemRemoveIcon onClick={handleRemoveClick} />}
    </LegendItemRoot>
  );
};

const getTitleText = title => {
  if (!Array.isArray(title)) {
    return title;
  }

  return title[0];
};

const getTitleNodes = title => {
  if (!Array.isArray(title)) {
    return title;
  }

  return title.map((text, index) => (
    <LegendItemSubtitle key={index}>{text}</LegendItemSubtitle>
  ));
};

export default memo(LegendItem);

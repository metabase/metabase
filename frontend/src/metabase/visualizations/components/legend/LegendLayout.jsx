import PropTypes from "prop-types";

import Legend from "./Legend";
import LegendActions from "./LegendActions";
import {
  ChartContainer,
  LegendContainer,
  LegendLayoutRoot,
  MainContainer,
} from "./LegendLayout.styled";

const MIN_ITEM_WIDTH = 100;
const MIN_ITEM_HEIGHT = 25;
const MIN_ITEM_HEIGHT_LARGE = 31;
const MIN_LEGEND_WIDTH = 400;

const propTypes = {
  className: PropTypes.string,
  items: PropTypes.array.isRequired,
  hovered: PropTypes.object,
  width: PropTypes.number,
  height: PropTypes.number,
  hasLegend: PropTypes.bool,
  actionButtons: PropTypes.node,
  isFullscreen: PropTypes.bool,
  isQueryBuilder: PropTypes.bool,
  children: PropTypes.node,
  onHoverChange: PropTypes.func,
  onSelectSeries: PropTypes.func,
  onToggleSeriesVisibility: PropTypes.func,
  isReversed: PropTypes.bool,
  legendPosition: PropTypes.oneOf(["auto", "top", "bottom", "left", "right", "none"]),
};

export const LegendLayout = ({
  className,
  items,
  hovered,
  width = 0,
  height = 0,
  hasLegend,
  actionButtons,
  isFullscreen,
  isQueryBuilder,
  children,
  onHoverChange,
  onSelectSeries,
  onToggleSeriesVisibility,
  isReversed,
  legendPosition = "auto",
}) => {
  const hasDimensions = width != null && height != null;
  const itemHeight = !isFullscreen ? MIN_ITEM_HEIGHT : MIN_ITEM_HEIGHT_LARGE;
  const maxXItems = Math.floor(width / MIN_ITEM_WIDTH);
  const maxYItems = Math.floor(height / itemHeight);
  const maxYLabels = Math.max(maxYItems - 1, 0);
  const minYLabels = items.length > maxYItems ? maxYLabels : items.length;

  const isNarrow = width < MIN_LEGEND_WIDTH;

  // Determine orientation and visibility based on legendPosition setting
  let isVertical;
  let isVisible;

  if (legendPosition === "none") {
    isVertical = false;
    isVisible = false;
  } else if (legendPosition === "left" || legendPosition === "right") {
    isVertical = true;
    isVisible = hasLegend && !isNarrow;
  } else if (legendPosition === "top" || legendPosition === "bottom") {
    isVertical = false;
    isVisible = hasLegend;
  } else {
    // "auto" - use the original auto-detection logic
    isVertical = maxXItems < items.length;
    isVisible = hasLegend && !(isVertical && isNarrow);
  }

  const isHorizontal = !isVertical;
  const visibleLength = isVertical ? minYLabels : items.length;

  const legend = (
    <LegendContainer
      isVertical={isVertical}
      isQueryBuilder={isQueryBuilder}
      legendPosition={legendPosition}
    >
      <Legend
        items={items}
        hovered={hovered}
        visibleLength={visibleLength}
        isVertical={isVertical}
        onHoverChange={onHoverChange}
        onSelectSeries={onSelectSeries}
        onToggleSeriesVisibility={onToggleSeriesVisibility}
        isQueryBuilder={isQueryBuilder}
        isReversed={isReversed}
      />
      {!isVertical && actionButtons && (
        <LegendActions>{actionButtons}</LegendActions>
      )}
    </LegendContainer>
  );

  // Determine if legend should appear before or after the main container
  const isLegendFirst =
    legendPosition === "top" ||
    legendPosition === "left" ||
    (legendPosition === "auto" && isHorizontal);

  return (
    <LegendLayoutRoot
      className={className}
      isVertical={isVertical}
      legendPosition={legendPosition}
    >
      {isVisible && isLegendFirst && legend}
      <MainContainer>
        {isVertical && actionButtons && (
          <LegendActions>{actionButtons}</LegendActions>
        )}
        {hasDimensions && <ChartContainer>{children}</ChartContainer>}
      </MainContainer>
      {isVisible && !isLegendFirst && legend}
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

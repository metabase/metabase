import PropTypes from "prop-types";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";

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
  labels: PropTypes.array.isRequired,
  colors: PropTypes.array.isRequired,
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
  onRemoveSeries: PropTypes.func,
  isReversed: PropTypes.bool,
  canRemoveSeries: PropTypes.func,
};

const LegendLayout = ({
  className,
  labels,
  colors,
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
  onRemoveSeries,
  isReversed,
  canRemoveSeries,
}) => {
  const hasDimensions = width != null && height != null;
  const itemHeight = !isFullscreen ? MIN_ITEM_HEIGHT : MIN_ITEM_HEIGHT_LARGE;
  const maxXItems = Math.floor(width / MIN_ITEM_WIDTH);
  const maxYItems = Math.floor(height / itemHeight);
  const maxYLabels = Math.max(maxYItems - 1, 0);
  const minYLabels = labels.length > maxYItems ? maxYLabels : labels.length;

  const isNarrow = width < MIN_LEGEND_WIDTH;
  const isVertical = maxXItems < labels.length;
  const isVisible = hasLegend && !(isVertical && isNarrow);
  const visibleLength = isVertical ? minYLabels : labels.length;

  return (
    <LegendLayoutRoot className={className} isVertical={isVertical}>
      {isVisible && (
        <LegendContainer
          isVertical={isVertical}
          isQueryBuilder={isQueryBuilder}
        >
          <Legend
            labels={labels}
            colors={colors}
            hovered={hovered}
            visibleLength={visibleLength}
            isVertical={isVertical}
            onHoverChange={onHoverChange}
            onSelectSeries={onSelectSeries}
            onRemoveSeries={onRemoveSeries}
            isReversed={isReversed}
            canRemoveSeries={canRemoveSeries}
          />
          {!isVertical && actionButtons && (
            <LegendActions>{actionButtons}</LegendActions>
          )}
        </LegendContainer>
      )}
      <MainContainer>
        {isVertical && actionButtons && (
          <LegendActions>{actionButtons}</LegendActions>
        )}
        {hasDimensions && <ChartContainer>{children}</ChartContainer>}
      </MainContainer>
    </LegendLayoutRoot>
  );
};

LegendLayout.propTypes = propTypes;

export default _.compose(ExplicitSize())(LegendLayout);

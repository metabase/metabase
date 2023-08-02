/* eslint-disable react/prop-types */
import { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { getAccentColors } from "metabase/lib/colors/groups";
import { Icon } from "metabase/core/components/Icon";
import ExplicitSize from "../../components/ExplicitSize";
import styles from "./Legend.css";
import { AddSeriesIcon, LegendHeaderItem } from "./LegendHeader.styled";

const DEFAULT_COLORS = getAccentColors();
const MIN_WIDTH_PER_SERIES = 100;

class LegendHeader extends Component {
  static propTypes = {
    series: PropTypes.array.isRequired,
    hovered: PropTypes.object,
    onHoverChange: PropTypes.func,
    onAddSeries: PropTypes.func,
    onEditSeries: PropTypes.func,
    onRemoveSeries: PropTypes.func,
    onChangeCardAndRun: PropTypes.func,
    actionButtons: PropTypes.node,
    description: PropTypes.string,
    classNameWidgets: PropTypes.string,
    icon: PropTypes.object,
  };

  static defaultProps = {
    series: [],
    settings: {},
    visualizationIsClickable: () => false,
  };

  render() {
    const {
      series,
      hovered,

      actionButtons,
      icon,
      onHoverChange,
      onChangeCardAndRun,
      settings,
      description,
      onVisualizationClick,
      visualizationIsClickable,
      classNameWidgets,
      width,
    } = this.props;

    const isBreakoutSeries = !!series[0].card._breakoutColumn;

    // disable these actions for breakout series
    const { onAddSeries, onEditSeries, onRemoveSeries } = isBreakoutSeries
      ? {}
      : this.props;

    const showDots = !!onAddSeries || series.length > 1;
    const isNarrow = width < MIN_WIDTH_PER_SERIES * series.length;
    const showTitles = !showDots || !isNarrow;

    const seriesSettings =
      settings.series && series.map(single => settings.series(single));

    const colors = seriesSettings
      ? seriesSettings.map(s => s.color)
      : DEFAULT_COLORS;
    const titles = seriesSettings
      ? seriesSettings.map(s => s.title)
      : series.map(single => single.card.name);

    return (
      <div
        className={cx(
          styles.LegendHeader,
          "Card-title mx1 flex flex-no-shrink flex-row align-center",
        )}
      >
        {series.map((s, index) => [
          <LegendHeaderItem
            key={index}
            title={titles[index]}
            icon={icon}
            description={description}
            color={colors[index % colors.length]}
            showDot={showDots}
            showTitle={showTitles}
            isMuted={
              hovered && hovered.index != null && index !== hovered.index
            }
            isBreakoutSeries={isBreakoutSeries}
            onMouseEnter={() => onHoverChange && onHoverChange({ index })}
            onMouseLeave={() => onHoverChange && onHoverChange(null)}
            onClick={
              onEditSeries
                ? e => onEditSeries(e, index)
                : s.clicked && visualizationIsClickable(s.clicked)
                ? e =>
                    onVisualizationClick({
                      ...s.clicked,
                      element: e.currentTarget,
                    })
                : onChangeCardAndRun
                ? () =>
                    onChangeCardAndRun({
                      nextCard: s.card,
                      seriesIndex: index,
                    })
                : null
            }
            infoClassName={classNameWidgets}
          />,
          onRemoveSeries && series.length > 1 && (
            <Icon
              name="close"
              className="text-light text-medium-hover flex-no-shrink mr2 cursor-pointer"
              width={12}
              height={12}
              onClick={e => onRemoveSeries(e, index)}
            />
          ),
        ])}
        {onAddSeries && (
          <AddSeriesIcon name="add" size={12} onClick={e => onAddSeries(e)} />
        )}
        {actionButtons && (
          <span
            className={cx(
              classNameWidgets,
              "flex-no-shrink flex-align-right relative",
            )}
          >
            {actionButtons}
          </span>
        )}
      </div>
    );
  }
}

export default ExplicitSize({ refreshMode: "debounce" })(LegendHeader);

import React, { Component } from "react";
import PropTypes from "prop-types";
import styles from "./Legend.css";

import ExplicitSize from "../../components/ExplicitSize";
import Icon from "metabase/components/Icon";
import LegendItem from "./LegendItem";

import cx from "classnames";

import { normal } from "metabase/lib/colors";
const DEFAULT_COLORS = Object.values(normal);
const MIN_WIDTH_PER_SERIES = 100;

@ExplicitSize()
export default class LegendHeader extends Component {
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
          <LegendItem
            key={index}
            title={titles[index]}
            description={description}
            color={colors[index % colors.length]}
            className={cx({ "text-brand-hover": !isBreakoutSeries })}
            showDot={showDots}
            showTitle={showTitles}
            isMuted={
              hovered && hovered.index != null && index !== hovered.index
            }
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
          <Icon
            name="add"
            className="mx1 flex-no-shrink text-medium text-brand-hover bg-medium rounded cursor-pointer"
            size={12}
            style={{ padding: 5 }}
            onClick={e => onAddSeries(e)}
          />
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

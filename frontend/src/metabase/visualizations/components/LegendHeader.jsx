/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import { getAccentColors } from "metabase/lib/colors/groups";

import ExplicitSize from "../../components/ExplicitSize";

import styles from "./Legend.module.css";
import { LegendHeaderItem } from "./LegendHeader.styled";

const DEFAULT_COLORS = getAccentColors();
const MIN_WIDTH_PER_SERIES = 100;

class LegendHeader extends Component {
  static propTypes = {
    series: PropTypes.array.isRequired,
    onChangeCardAndRun: PropTypes.func,
    actionButtons: PropTypes.node,
  };

  static defaultProps = {
    series: [],
    settings: {},
    visualizationIsClickable: () => false,
  };

  render() {
    const {
      series,

      actionButtons,
      onChangeCardAndRun,
      settings,
      onVisualizationClick,
      visualizationIsClickable,
      width,
    } = this.props;

    const isBreakoutSeries = !!series[0].card._breakoutColumn;

    const showDots = series.length > 1;
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
          "Card-title",
          CS.textDefault,
          CS.textSmaller,
          CS.mx1,
          CS.flex,
          CS.flexNoShrink,
          CS.flexRow,
          CS.alignCenter,
        )}
      >
        {series.map((s, index) => [
          <LegendHeaderItem
            key={index}
            title={titles[index]}
            color={colors[index % colors.length]}
            showDot={showDots}
            showTitle={showTitles}
            isBreakoutSeries={isBreakoutSeries}
            onClick={
              s.clicked && visualizationIsClickable(s.clicked)
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
          />,
        ])}
        {actionButtons && (
          <span className={cx(CS.flexNoShrink, CS.flexAlignRight, CS.relative)}>
            {actionButtons}
          </span>
        )}
      </div>
    );
  }
}

export default ExplicitSize({ refreshMode: "debounce" })(LegendHeader);

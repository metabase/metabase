import React, { Component } from "react";
import styles from "./ChartWithLegend.css";

import LegendVertical from "./LegendVertical";
import LegendHorizontal from "./LegendHorizontal";

import ExplicitSize from "metabase/components/ExplicitSize";

import cx from "classnames";

const GRID_ASPECT_RATIO = 4 / 3;
const PADDING = 14;

const DEFAULT_GRID_SIZE = 100;

@ExplicitSize({ wrapped: true })
export default class ChartWithLegend extends Component {
  static defaultProps = {
    aspectRatio: 1,
    style: {},
  };

  render() {
    let {
      children,
      legendTitles,
      legendColors,
      hovered,
      onHoverChange,
      className,
      style,
      gridSize,
      aspectRatio,
      height,
      width,
      showLegend,
      isDashboard,
    } = this.props;

    // padding
    width -= PADDING * 2;
    height -= PADDING;

    if (!gridSize) {
      gridSize = {
        width: width / DEFAULT_GRID_SIZE,
        height: height / DEFAULT_GRID_SIZE,
      };
    }

    let chartWidth;
    let chartHeight;
    let flexChart = false;
    let type;
    let LegendComponent;
    const isHorizontal = gridSize.width > gridSize.height / GRID_ASPECT_RATIO;
    if (showLegend === false) {
      type = "small";
    } else if (
      !gridSize ||
      (isHorizontal &&
        (showLegend || gridSize.width > 4 || gridSize.height > 4))
    ) {
      type = "horizontal";
      LegendComponent = LegendVertical;
      if (gridSize && gridSize.width < 6) {
        legendTitles = legendTitles.map(title =>
          Array.isArray(title) ? title.slice(0, 1) : title,
        );
      }
      const desiredWidth = height * aspectRatio;
      if (desiredWidth > width * (2 / 3)) {
        flexChart = true;
      } else {
        chartWidth = desiredWidth;
      }
      chartHeight = height;
    } else if (
      !isHorizontal &&
      (showLegend || (gridSize.height > 3 && gridSize.width > 2))
    ) {
      type = "vertical";
      LegendComponent = LegendHorizontal;
      legendTitles = legendTitles.map(title =>
        Array.isArray(title) ? title[0] : title,
      );
      const desiredHeight = width * (1 / aspectRatio);
      if (desiredHeight > height * (3 / 4)) {
        // chartHeight = height * (3 / 4);
        flexChart = true;
      } else {
        chartHeight = desiredHeight;
      }
      chartWidth = width;
    } else {
      type = "small";
    }

    const legend = LegendComponent ? (
      <LegendComponent
        className={styles.Legend}
        titles={legendTitles}
        colors={legendColors}
        hovered={hovered}
        onHoverChange={onHoverChange}
      />
    ) : null;

    return (
      <div
        className={cx(
          className,
          "fullscreen-text-small fullscreen-normal-text fullscreen-night-text",
          styles.ChartWithLegend,
          styles[type],
          flexChart && styles.flexChart,
        )}
        style={{
          ...style,
          paddingBottom: PADDING,
          paddingLeft: PADDING,
          paddingRight: PADDING,
        }}
      >
        {legend && <div className={cx(styles.LegendWrapper)}>{legend}</div>}
        <div
          className={cx(styles.Chart)}
          style={{ width: chartWidth, height: chartHeight }}
        >
          {children}
        </div>
        {/* spacer div to balance legend */}
        {legend && (
          <div
            className={cx(styles.LegendSpacer)}
            // don't center the chart on dashboards
            style={isDashboard ? { flexBasis: 0 } : {}}
          >
            {legend}
          </div>
        )}
      </div>
    );
  }
}

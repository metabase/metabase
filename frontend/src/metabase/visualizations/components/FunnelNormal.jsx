/* @flow */

import React, { Component } from "react";

import cx from "classnames";
import styles from "./FunnelNormal.css";

import Ellipsified from "metabase/components/Ellipsified";
import { formatValue } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { normal } from "metabase/lib/colors";

const DEFAULT_COLORS = Object.values(normal);

import type {
  VisualizationProps,
  HoverObject,
  ClickObject,
} from "metabase-types/types/Visualization";

type StepInfo = {
  value: number,
  graph: {
    startBottom: number,
    startTop: number,
    endBottom: number,
    endTop: number,
  },
  hovered?: HoverObject,
  clicked?: ClickObject,
};

export default class FunnelNormal extends Component {
  props: VisualizationProps;

  render() {
    const {
      className,
      series,
      gridSize,
      hovered,
      onHoverChange,
      onVisualizationClick,
      visualizationIsClickable,
      settings,
    } = this.props;

    const dimensionIndex = 0;
    const metricIndex = 1;
    const cols = series[0].data.cols;
    // $FlowFixMe
    const rows: number[][] = series.map(s => s.data.rows[0]);

    const funnelSmallSize =
      gridSize && (gridSize.width < 7 || gridSize.height <= 5);

    const formatDimension = (dimension, jsx = true) =>
      formatValue(dimension, {
        ...settings.column(cols[dimensionIndex]),
        jsx,
        majorWidth: 0,
      });
    const formatMetric = (metric, jsx = true) =>
      formatValue(metric, {
        ...settings.column(cols[metricIndex]),
        jsx,
        majorWidth: 0,
      });
    const formatPercent = percent => `${(100 * percent).toFixed(2)} %`;

    // Initial infos (required for step calculation)
    let infos: StepInfo[] = [
      {
        value: rows[0][metricIndex],
        graph: {
          startBottom: 0.0,
          startTop: 1.0,
          endBottom: 0.0,
          endTop: 1.0,
        },
      },
    ];

    let remaining: number = rows[0][metricIndex];

    rows.map((row, rowIndex) => {
      remaining -= infos[rowIndex].value - row[metricIndex];

      infos[rowIndex + 1] = {
        value: row[metricIndex],

        graph: {
          startBottom: infos[rowIndex].graph.endBottom,
          startTop: infos[rowIndex].graph.endTop,
          endTop: 0.5 + remaining / infos[0].value / 2,
          endBottom: 0.5 - remaining / infos[0].value / 2,
        },

        hovered: {
          index: rowIndex,
          data: [
            {
              key: "Step",
              value: row[dimensionIndex],
              col: cols[dimensionIndex],
            },
            {
              key: getFriendlyName(cols[metricIndex]),
              value: row[metricIndex],
              col: cols[metricIndex],
            },
            {
              key: "Retained",
              value: formatPercent(row[metricIndex] / infos[0].value),
            },
          ],
        },

        clicked: {
          value: row[metricIndex],
          column: cols[metricIndex],
          dimensions: [
            {
              value: row[dimensionIndex],
              column: cols[dimensionIndex],
            },
          ],
        },
      };
    });

    // Remove initial setup
    infos = infos.slice(1);

    const initial = infos[0];

    const isClickable = visualizationIsClickable(infos[0].clicked);

    return (
      <div
        className={cx(className, styles.Funnel, "flex", {
          [styles.Small]: funnelSmallSize,
          p1: funnelSmallSize,
          p2: !funnelSmallSize,
        })}
      >
        <div
          className={cx(styles.FunnelStep, styles.Initial, "flex flex-column")}
        >
          <Ellipsified className={styles.Head}>
            {formatDimension(rows[0][dimensionIndex])}
          </Ellipsified>
          <div className={styles.Start}>
            <div className={styles.Title}>
              {formatMetric(rows[0][metricIndex])}
            </div>
            <div className={styles.Subtitle}>
              {getFriendlyName(cols[dimensionIndex])}
            </div>
          </div>
          {/* This part of code in used only to share height between .Start and .Graph columns. */}
          <div className={styles.Infos}>
            <div className={styles.Title}>&nbsp;</div>
            <div className={styles.Subtitle}>&nbsp;</div>
          </div>
        </div>
        {infos.slice(1).map((info, index) => (
          <div
            key={index}
            className={cx(styles.FunnelStep, "flex flex-column")}
          >
            <Ellipsified className={styles.Head}>
              {formatDimension(rows[index + 1][dimensionIndex])}
            </Ellipsified>
            <GraphSection
              className={cx({ "cursor-pointer": isClickable })}
              index={index}
              info={info}
              infos={infos}
              hovered={hovered}
              onHoverChange={onHoverChange}
              onVisualizationClick={isClickable ? onVisualizationClick : null}
            />
            <div className={styles.Infos}>
              <div className={styles.Title}>
                {formatPercent(info.value / initial.value)}
              </div>
              <div className={styles.Subtitle}>
                {formatMetric(rows[index + 1][metricIndex])}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
}
const GraphSection = ({
  index,
  info,
  infos,
  hovered,
  onHoverChange,
  onVisualizationClick,
  className,
}: {
  className?: string,
  index: number,
  info: StepInfo,
  infos: StepInfo[],
  hovered: ?HoverObject,
  onVisualizationClick: ?(clicked: ?ClickObject) => void,
  onHoverChange: (hovered: ?HoverObject) => void,
}) => {
  return (
    <svg
      className={cx(className, styles.Graph)}
      onMouseMove={e => {
        if (onHoverChange && info.hovered) {
          onHoverChange({
            ...info.hovered,
            event: e.nativeEvent,
          });
        }
      }}
      onMouseLeave={() => onHoverChange && onHoverChange(null)}
      onClick={e => {
        if (onVisualizationClick && info.clicked) {
          onVisualizationClick({
            ...info.clicked,
            event: e.nativeEvent,
          });
        }
      }}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
    >
      <polygon
        opacity={1 - index * (0.9 / (infos.length + 1))}
        fill={DEFAULT_COLORS[0]}
        points={`0 ${info.graph.startBottom}, 0 ${info.graph.startTop}, 1 ${info.graph.endTop}, 1 ${info.graph.endBottom}`}
      />
    </svg>
  );
};

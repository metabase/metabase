/* eslint-disable react/prop-types */
import { Component } from "react";

import cx from "classnames";

import Ellipsified from "metabase/core/components/Ellipsified";
import { formatValue } from "metabase/lib/formatting";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { findSeriesByKey } from "metabase/visualizations/lib/series";

import { color } from "metabase/lib/colors";
import {
  FunnelNormalRoot,
  FunnelStart,
  FunnelStep,
  Head,
  Info,
  Subtitle,
  Title,
} from "metabase/visualizations/components/FunnelNormal.styled";

export default class FunnelNormal extends Component {
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
    const rows = settings["funnel.rows"]
      ? settings["funnel.rows"]
          .filter(fr => fr.enabled)
          .map(fr => findSeriesByKey(series, fr.key).data.rows[0])
      : series.map(s => s.data.rows[0]);

    const isNarrow = gridSize && gridSize.width < 7;
    const isShort = gridSize && gridSize.height <= 5;
    const isSmall = isShort || isNarrow;

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
    let infos = [
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

    let remaining = rows[0][metricIndex];

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
          settings,
        },
      };
    });

    // Remove initial setup
    infos = infos.slice(1);

    const initial = infos[0];

    const isClickable = visualizationIsClickable(infos[0].clicked);

    return (
      <FunnelNormalRoot
        className={className}
        isSmall={isSmall}
        data-testid="funnel-chart"
      >
        <FunnelStep isFirst>
          <Head isNarrow={isNarrow}>
            <Ellipsified data-testid="funnel-chart-header">
              {formatDimension(rows[0][dimensionIndex])}
            </Ellipsified>
          </Head>
          <FunnelStart isNarrow={isNarrow}>
            <Title>{formatMetric(rows[0][metricIndex])}</Title>
            <Subtitle>{getFriendlyName(cols[metricIndex])}</Subtitle>
          </FunnelStart>
          {/* This part of code in used only to share height between .Start and .Graph columns. */}
          <Info isNarrow={isNarrow}>
            <Title>&nbsp;</Title>
            <Subtitle>&nbsp;</Subtitle>
          </Info>
        </FunnelStep>
        {infos.slice(1).map((info, index) => {
          const stepPercentage =
            initial.value > 0 ? info.value / initial.value : 0;

          return (
            <FunnelStep key={index}>
              <Head isNarrow={isNarrow}>
                <Ellipsified data-testid="funnel-chart-header">
                  {formatDimension(rows[index + 1][dimensionIndex])}
                </Ellipsified>
              </Head>
              <GraphSection
                className={cx({ "cursor-pointer": isClickable })}
                index={index}
                info={info}
                infos={infos}
                hovered={hovered}
                onHoverChange={onHoverChange}
                onVisualizationClick={isClickable ? onVisualizationClick : null}
              />
              <Info isNarrow={isNarrow}>
                <Title>
                  <Ellipsified>{formatPercent(stepPercentage)}</Ellipsified>
                </Title>
                <Subtitle>
                  <Ellipsified>
                    {formatMetric(rows[index + 1][metricIndex])}
                  </Ellipsified>
                </Subtitle>
              </Info>
            </FunnelStep>
          );
        })}
      </FunnelNormalRoot>
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
}) => {
  return (
    <div className="relative full-height">
      <svg
        height="100%"
        width="100%"
        className={cx(className, "absolute")}
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
          fill={color("brand")}
          points={`0 ${info.graph.startBottom}, 0 ${info.graph.startTop}, 1 ${info.graph.endTop}, 1 ${info.graph.endBottom}`}
        />
      </svg>
    </div>
  );
};

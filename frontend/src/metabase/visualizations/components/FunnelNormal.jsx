/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import {
  formatChangeWithSign,
  formatNumber,
  formatValue,
} from "metabase/lib/formatting";
import { formatNullable } from "metabase/lib/formatting/nullable";
import {
  FunnelNormalRoot,
  FunnelStart,
  FunnelStep,
  Head,
  Info,
  Subtitle,
  Title,
} from "metabase/visualizations/components/FunnelNormal.styled";
import { getFriendlyName } from "metabase/visualizations/lib/utils";

import { computeChange } from "../lib/numeric";

export default class FunnelNormal extends Component {
  render() {
    const {
      className,
      rawSeries,
      gridSize,
      hovered,
      onHoverChange,
      onVisualizationClick,
      visualizationIsClickable,
      settings,
      isPlaceholder,
    } = this.props;

    const [series] = isPlaceholder ? this.props.series : rawSeries;
    const {
      data: { cols, rows },
    } = series;

    const dimensionIndex = cols.findIndex(
      col => col.name === settings["funnel.dimension"],
    );
    const metricIndex = cols.findIndex(
      col => col.name === settings["funnel.metric"],
    );

    const sortedRows = settings["funnel.rows"]
      ? settings["funnel.rows"]
          .filter(fr => fr.enabled)
          .map(fr =>
            rows.find(row => formatNullable(row[dimensionIndex]) === fr.key),
          )
      : rows;

    const isNarrow = gridSize && gridSize.width < 7;
    const isShort = gridSize && gridSize.height <= 5;
    const isSmall = isShort || isNarrow;

    const formatDimension = (dimension, jsx = true) =>
      formatValue(dimension, {
        ...settings.column(cols[dimensionIndex]),
        jsx,
        stringifyNull: true,
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
        value: sortedRows[0][metricIndex],
        graph: {
          startBottom: 0.0,
          startTop: 1.0,
          endBottom: 0.0,
          endTop: 1.0,
        },
      },
    ];

    let remaining = sortedRows[0][metricIndex];

    sortedRows.map((row, rowIndex) => {
      remaining -= infos[rowIndex].value - row[metricIndex];

      const footerData = [
        {
          key: t`Retained`,
          value: formatNumber(row[metricIndex] / infos[0].value, {
            number_style: "percent",
          }),
        },
      ];

      const prevRow = sortedRows[rowIndex - 1];
      if (prevRow != null) {
        footerData.push({
          key: t`Compared to previous`,
          value: formatChangeWithSign(
            computeChange(prevRow[metricIndex], row[metricIndex]),
          ),
        });
      }

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
          ],
          footerData,
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

    const isClickable = onVisualizationClick != null;

    const handleClick = e => {
      if (onVisualizationClick && visualizationIsClickable(infos[0].clicked)) {
        onVisualizationClick(e);
      }
    };

    return (
      <FunnelNormalRoot
        className={className}
        isSmall={isSmall}
        data-testid="funnel-chart"
      >
        <FunnelStep isFirst>
          <Head isNarrow={isNarrow}>
            <Ellipsified data-testid="funnel-chart-header">
              {formatDimension(sortedRows[0][dimensionIndex])}
            </Ellipsified>
          </Head>
          <FunnelStart isNarrow={isNarrow}>
            <Title>{formatMetric(sortedRows[0][metricIndex])}</Title>
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
                  {formatDimension(sortedRows[index + 1][dimensionIndex])}
                </Ellipsified>
              </Head>
              <GraphSection
                className={cx({ [CS.cursorPointer]: isClickable })}
                index={index}
                info={info}
                infos={infos}
                hovered={hovered}
                onHoverChange={onHoverChange}
                onVisualizationClick={handleClick}
              />
              <Info isNarrow={isNarrow}>
                <Title>
                  <Ellipsified>{formatPercent(stepPercentage)}</Ellipsified>
                </Title>
                <Subtitle>
                  <Ellipsified>
                    {formatMetric(sortedRows[index + 1][metricIndex])}
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
    <div className={cx(CS.relative, CS.fullHeight)}>
      <svg
        height="100%"
        width="100%"
        className={cx(className, CS.absolute)}
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

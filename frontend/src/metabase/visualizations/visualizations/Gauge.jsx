/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import d3 from "d3";
import cx from "classnames";

import { normal } from "metabase/lib/colors";

import ChartSettingGaugeSegments from "metabase/visualizations/components/settings/ChartSettingGaugeSegments";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

const OUTER_RADIUS = 45; // within 100px canvas
const INNER_RADIUS_RATIO = 4 / 5;

export default class Gauge extends Component {
  props: VisualizationProps;

  static uiName = t`Gauge`;
  static identifier = "gauge";
  static iconName = "number";

  static minSize = { width: 3, height: 3 };

  static isSensible(cols, rows) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable([{ data: { cols, rows } }]) {
    // scalar can always be rendered, nothing needed here
  }

  static settings = {
    "gauge.segments": {
      section: "Display",
      title: t`Segments`,
      default: [
        { value: 0, color: normal.green },
        { value: 33, color: normal.yellow },
        { value: 66, color: normal.red },
        { value: 100, color: normal.gray },
      ],
      widget: ChartSettingGaugeSegments,
    },
  };

  render() {
    const {
      series: [{ data: { rows } }],
      settings,
      className,
      width,
      height,
    } = this.props;

    let svgWidth, svgHeight;
    if (height / width < 0.5) {
      svgHeight = height;
      svgWidth = height * 2;
    } else {
      svgWidth = width;
      svgHeight = width / 2;
    }

    const segments = settings["gauge.segments"];

    const arc = d3.svg
      .arc()
      .outerRadius(OUTER_RADIUS)
      .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

    const angle = d3.scale
      .linear()
      .domain([segments[0].value, segments[segments.length - 1].value])
      .range([-Math.PI / 2, Math.PI / 2]);

    const value = rows[0][0];

    const dialPosition = distance =>
      Math.cos(angle(value) - Math.PI / 2) * distance +
      " " +
      Math.sin(angle(value) - Math.PI / 2) * distance;

    return (
      <div className={cx(className, "flex layout-centered")}>
        <div
          className="relative"
          style={{ width: svgWidth, height: svgHeight }}
        >
          <svg viewBox="0 0 100 50">
            <g transform={`translate(50,50)`}>
              {segments.slice(0, -1).map((segment, index) => (
                <path
                  d={arc({
                    startAngle: angle(segments[index].value),
                    endAngle: angle(segments[index + 1].value),
                  })}
                  fill={segment.color}
                />
              ))}
              <path
                d={`M${dialPosition(
                  OUTER_RADIUS * INNER_RADIUS_RATIO,
                )} L${dialPosition(OUTER_RADIUS)} `}
                strokeWidth={2}
                strokeLinecap="round"
                stroke={normal.grey2}
              />
            </g>
          </svg>
        </div>
      </div>
    );
  }
}

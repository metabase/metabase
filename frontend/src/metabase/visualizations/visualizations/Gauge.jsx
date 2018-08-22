/* @flow */

import React, { Component } from "react";
import { t } from "c-3po";
import d3 from "d3";
import cx from "classnames";

import Scalar from "./Scalar";

import colors from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";

import ChartSettingGaugeSegments from "metabase/visualizations/components/settings/ChartSettingGaugeSegments";
import ChartSettingRange from "metabase/visualizations/components/settings/ChartSettingRange";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

const OUTER_RADIUS = 45; // within 100px canvas
const INNER_RADIUS_RATIO = 4 / 5;
const INNER_RADIUS = OUTER_RADIUS * INNER_RADIUS_RATIO;
const ARROW_HEIGHT = (OUTER_RADIUS - INNER_RADIUS) * 2 / 3;
const ARROW_BASE = ARROW_HEIGHT / Math.tan(60 / 180 * Math.PI); // equilateral triangle
const ARROW_THICKNESS = 1.5;

// total degrees of the arc (180 = semicircle, etc)
const ARC_DEGREES = 180 + 45 * 2; // semicircle plus a bit

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

  state = {
    mounted: false,
  };

  static settings = {
    "gauge.range": {
      section: "Display",
      title: t`Gauge range`,
      getDefault(series, vizSettings) {
        const values = [
          ...vizSettings["gauge.segments"].map(s => s.max),
          ...vizSettings["gauge.segments"].map(s => s.min),
        ];
        return [Math.min(...values), Math.max(...values)];
      },
      readDependencies: ["gauge.segments"],
      widget: ChartSettingRange,
    },
    "gauge.segments": {
      section: "Display",
      title: t`Colored ranges`,
      default: [
        { min: 20, max: 30, color: colors["error"], label: "Inefficient" },
        { min: 40, max: 75, color: colors["success"], label: "Most efficient" },
      ],
      widget: ChartSettingGaugeSegments,
    },
  };

  componentDidMount() {
    this.setState({ mounted: true });
  }

  render() {
    const {
      series: [{ data: { rows, cols } }],
      settings,
      className,
      width,
      height,
    } = this.props;

    const viewBoxHeight =
      (ARC_DEGREES > 180 ? 50 : 0) +
      Math.sin(ARC_DEGREES / 2 / 180 * Math.PI) * 50;
    const viewBoxWidth = 100;

    const svgAspectRatio = viewBoxHeight / viewBoxWidth;
    const containerAspectRadio = height / width;

    let svgWidth, svgHeight;
    if (containerAspectRadio < svgAspectRatio) {
      svgHeight = height;
      svgWidth = height / svgAspectRatio;
    } else {
      svgWidth = width;
      svgHeight = width / svgAspectRatio;
    }

    const range = settings["gauge.range"];
    const segments = settings["gauge.segments"];

    const arc = d3.svg
      .arc()
      .outerRadius(OUTER_RADIUS)
      .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

    const angle = d3.scale
      .linear()
      .domain(range) // NOTE: confusing, but the "range" is the domain for the arc scale
      // .domain([segments[0].value, segments[segments.length - 1].value])
      .range([
        ARC_DEGREES / 180 * -Math.PI / 2,
        ARC_DEGREES / 180 * Math.PI / 2,
      ])
      .clamp(true);

    const value = rows[0][0];
    const column = cols[0];

    const valuePosition = (value, distance) => {
      return [
        Math.cos(angle(value) - Math.PI / 2) * distance,
        Math.sin(angle(value) - Math.PI / 2) * distance,
      ];
    };

    const radiusCenter = OUTER_RADIUS - (OUTER_RADIUS - INNER_RADIUS) / 2;

    // get unique min/max plus range endpoints
    const numberLabels = Array.from(
      new Set(
        range.concat(...segments.map(segment => [segment.min, segment.max])),
      ),
    );

    const textLabels = segments
      .filter(segment => segment.label)
      .map(segment => ({
        label: segment.label,
        value: segment.min + (segment.max - segment.min) / 2,
      }));

    return (
      <div className={cx(className, "flex layout-centered")}>
        <div
          className="relative"
          style={{ width: svgWidth, height: svgHeight }}
        >
          <Scalar {...this.props} className="spread" style={{ top: 0 }} />
          <svg viewBox={`0 0 100 ${viewBoxHeight}`}>
            <g transform={`translate(50,50)`}>
              {/* BACKGROUND ARC */}
              <path
                d={arc({
                  startAngle: angle(range[0]),
                  endAngle: angle(range[1]),
                })}
                fill={colors["bg-medium"]}
              />
              {/* SEGMENT ARCS */}
              {segments.map((segment, index) => (
                <path
                  d={arc({
                    startAngle: angle(segments[index].min),
                    endAngle: angle(segments[index].max),
                  })}
                  fill={segment.color}
                />
              ))}
              {/* NEEDLE */}
              <path
                d={`M-${ARROW_BASE} 0 L0 -${ARROW_HEIGHT} L${ARROW_BASE} 0 Z`}
                stroke="white"
                strokeWidth={ARROW_THICKNESS}
                fill="none"
                transform={`translate(0,-${INNER_RADIUS}) rotate(${angle(
                  this.state.mounted ? value : 0,
                ) *
                  180 /
                  Math.PI}, 0, ${INNER_RADIUS})`}
                style={{ transition: "transform 0.5s ease-in-out" }}
              />
              {/* NUMBER LABELS */}
              {numberLabels.map((value, index) => (
                <GaugeLabel
                  position={valuePosition(value, OUTER_RADIUS * 1.01)}
                >
                  {formatValue(value, { column })}
                </GaugeLabel>
              ))}
              {/* TEXT LABELS */}
              {textLabels.map(({ label, value }, index) => (
                <GaugeLabel
                  position={valuePosition(value, OUTER_RADIUS * 1.01)}
                  style={{
                    fill: colors["text-dark"],
                  }}
                >
                  {label}
                </GaugeLabel>
              ))}
            </g>
          </svg>
        </div>
      </div>
    );
  }
}

const GaugeLabel = ({ position: [x, y], style = {}, children }) => {
  return (
    <text
      x={x}
      y={y}
      style={{
        fill: colors["text-medium"],
        fontSize: "0.15em",
        textAnchor: Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end",
        // shift text in the lower half down a bit
        transform: y > 0 ? "translate(0,0.15em)" : undefined,
        ...style,
      }}
    >
      {children}
    </text>
  );
};

/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { t } from "c-3po";
import d3 from "d3";
import cx from "classnames";

import colors from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";

import ChartSettingGaugeSegments from "metabase/visualizations/components/settings/ChartSettingGaugeSegments";
import ChartSettingRange from "metabase/visualizations/components/settings/ChartSettingRange";

import type { VisualizationProps } from "metabase/meta/types/Visualization";

const OUTER_RADIUS = 45; // within 100px SVG element
const INNER_RADIUS_RATIO = 3.7 / 5;
const INNER_RADIUS = OUTER_RADIUS * INNER_RADIUS_RATIO;

// arrow shape, currently an equilateral triangle
const ARROW_HEIGHT = (OUTER_RADIUS - INNER_RADIUS) * 3 / 4; // 2/3 of segment thickness
const ARROW_BASE = ARROW_HEIGHT / Math.tan(60 / 180 * Math.PI);
const ARROW_STROKE_THICKNESS = 1.25;

// colors
const BACKGROUND_ARC_COLOR = colors["bg-medium"];
const SEGMENT_LABEL_COLOR = colors["text-dark"];
const CENTER_LABEL_COLOR = colors["text-dark"];
const ARROW_FILL_COLOR = colors["text-dark"];
const ARROW_STROKE_COLOR = "white";

// in ems, but within the scaled 100px SVG element
const FONT_SIZE_SEGMENT_LABEL = 0.15;
const FONT_SIZE_CENTER_LABEL_MIN = 0.5;
const FONT_SIZE_CENTER_LABEL_MAX = 0.7;

// hide labels if SVG width is smaller than this
const MIN_WIDTH_LABEL_THRESHOLD = 400;

// total degrees of the arc (180 = semicircle, etc)
const ARC_DEGREES = 180 + 45 * 2; // semicircle plus a bit

const radians = degrees => degrees * Math.PI / 180;
const degrees = radians => radians * 180 / Math.PI;

export default class Gauge extends Component {
  props: VisualizationProps;

  static uiName = t`Gauge`;
  static identifier = "gauge";
  static iconName = "gauge";

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
    this._updateLabelSize();
  }
  componentDidUpdate() {
    this._updateLabelSize();
  }

  _updateLabelSize() {
    // TODO: extract this into a component that resizes SVG <text> element to fit bounds
    const label = ReactDOM.findDOMNode(this._label);
    if (label) {
      const { width: currentWidth } = label.getBBox();
      // maxWidth currently 95% of inner diameter, could be more intelligent based on text aspect ratio
      const maxWidth = INNER_RADIUS * 2 * 0.95;
      const currentFontSize = parseFloat(
        label.style.fontSize.replace("em", ""),
      );
      // scale the font based on currentWidth/maxWidth, within min and max
      // TODO: if text is too big wrap or ellipsis?
      const desiredFontSize = Math.max(
        FONT_SIZE_CENTER_LABEL_MIN,
        Math.min(
          FONT_SIZE_CENTER_LABEL_MAX,
          currentFontSize * (maxWidth / currentWidth),
        ),
      );
      // don't resize if within 5% to avoid potential thrashing
      if (Math.abs(1 - currentFontSize / desiredFontSize) > 0.05) {
        label.style.fontSize = desiredFontSize + "em";
      }
    }
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
      (ARC_DEGREES > 180 ? 50 : 0) + Math.sin(radians(ARC_DEGREES / 2)) * 50;
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

    const showLabels = svgWidth > MIN_WIDTH_LABEL_THRESHOLD;

    const range = settings["gauge.range"];
    const segments = settings["gauge.segments"];

    // value to angle in radians, clamped
    const angle = d3.scale
      .linear()
      .domain(range) // NOTE: confusing, but the "range" is the domain for the arc scale
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
      <div className={cx(className, "relative")}>
        <div
          className="absolute overflow-hidden"
          style={{
            width: svgWidth,
            height: svgHeight,
            top: (height - svgHeight) / 2,
            left: (width - svgWidth) / 2,
          }}
        >
          <svg viewBox={`0 0 100 ${viewBoxHeight}`}>
            <g transform={`translate(50,50)`}>
              {/* BACKGROUND ARC */}
              <GaugeArc
                start={angle(range[0])}
                end={angle(range[1])}
                fill={BACKGROUND_ARC_COLOR}
              />
              {/* SEGMENT ARCS */}
              {segments.map((segment, index) => (
                <GaugeArc
                  key={index}
                  start={angle(segment.min)}
                  end={angle(segment.max)}
                  fill={segment.color}
                />
              ))}
              {/* NEEDLE */}
              <GaugeNeedle angle={angle(this.state.mounted ? value : 0)} />
              {/* NUMBER LABELS */}
              {showLabels &&
                numberLabels.map((value, index) => (
                  <GaugeSegmentLabel
                    position={valuePosition(value, OUTER_RADIUS * 1.01)}
                  >
                    {formatValue(value, { column })}
                  </GaugeSegmentLabel>
                ))}
              {/* TEXT LABELS */}
              {showLabels &&
                textLabels.map(({ label, value }, index) => (
                  <GaugeSegmentLabel
                    position={valuePosition(value, OUTER_RADIUS * 1.01)}
                    style={{
                      fill: SEGMENT_LABEL_COLOR,
                    }}
                  >
                    {label}
                  </GaugeSegmentLabel>
                ))}
              {/* CENTER LABEL */}
              {/* NOTE: can't be a component because ref doesn't work? */}
              <text
                ref={label => (this._label = label)}
                x={0}
                y={0}
                style={{
                  fill: CENTER_LABEL_COLOR,
                  fontSize: "1em",
                  fontWeight: "bold",
                  textAnchor: "middle",
                  transform: "translate(0,0.2em)",
                }}
              >
                {formatValue(value, { column })}
              </text>
            </g>
          </svg>
        </div>
      </div>
    );
  }
}

const GaugeArc = ({ start, end, fill }) => {
  const arc = d3.svg
    .arc()
    .outerRadius(OUTER_RADIUS)
    .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);
  return (
    <path
      d={arc({
        startAngle: start,
        endAngle: end,
      })}
      fill={fill}
    />
  );
};

const GaugeNeedle = ({ angle }) => (
  <path
    d={`M-${ARROW_BASE} 0 L0 -${ARROW_HEIGHT} L${ARROW_BASE} 0 Z`}
    transform={`translate(0,-${INNER_RADIUS}) rotate(${degrees(
      angle,
    )}, 0, ${INNER_RADIUS})`}
    style={{ transition: "transform 0.5s ease-in-out" }}
    stroke={ARROW_STROKE_COLOR}
    strokeWidth={ARROW_STROKE_THICKNESS}
    fill={ARROW_FILL_COLOR}
  />
);

const GaugeSegmentLabel = ({ position: [x, y], style = {}, children }) => (
  <text
    x={x}
    y={y}
    style={{
      fill: colors["text-medium"],
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}em`,
      textAnchor: Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end",
      // shift text in the lower half down a bit
      transform:
        y > 0 ? `translate(0,${FONT_SIZE_SEGMENT_LABEL}em)` : undefined,
      ...style,
    }}
  >
    {children}
  </text>
);

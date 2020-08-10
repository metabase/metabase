/* @flow */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";
import d3 from "d3";
import cx from "classnames";

import _ from "underscore";

import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { isNumeric } from "metabase/lib/schema_metadata";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import ChartSettingGaugeSegments from "metabase/visualizations/components/settings/ChartSettingGaugeSegments";

import type { VisualizationProps } from "metabase-types/types/Visualization";

const MAX_WIDTH = 500;
const PADDING_BOTTOM = 10;

const OUTER_RADIUS = 45; // within 100px SVG element
const INNER_RADIUS_RATIO = 3.7 / 5;
const INNER_RADIUS = OUTER_RADIUS * INNER_RADIUS_RATIO;

// arrow shape, currently an equilateral triangle
const ARROW_HEIGHT = ((OUTER_RADIUS - INNER_RADIUS) * 2.5) / 4; // 2/3 of segment thickness
const ARROW_BASE = ARROW_HEIGHT / Math.tan((64 / 180) * Math.PI);
const ARROW_STROKE_THICKNESS = 1.25;

// colors
const BACKGROUND_ARC_COLOR = color("bg-medium");
const SEGMENT_LABEL_COLOR = color("text-dark");
const CENTER_LABEL_COLOR = color("text-dark");
const ARROW_FILL_COLOR = color("text-medium");
const ARROW_STROKE_COLOR = "white";

// in ems, but within the scaled 100px SVG element
const FONT_SIZE_SEGMENT_LABEL = 0.25;
const FONT_SIZE_CENTER_LABEL_MIN = 0.5;
const FONT_SIZE_CENTER_LABEL_MAX = 0.7;

// hide labels if SVG width is smaller than this
const MIN_WIDTH_LABEL_THRESHOLD = 250;

const LABEL_OFFSET_PERCENT = 1.025;

// total degrees of the arc (180 = semicircle, etc)
const ARC_DEGREES = 180 + 45 * 2; // semicircle plus a bit

const radians = degrees => (degrees * Math.PI) / 180;
const degrees = radians => (radians * 180) / Math.PI;

const segmentIsValid = s => !isNaN(s.min) && !isNaN(s.max);

export default class Gauge extends Component {
  props: VisualizationProps;

  static uiName = t`Gauge`;
  static identifier = "gauge";
  static iconName = "gauge";

  static minSize = { width: 4, height: 4 };

  static isSensible({ cols, rows }) {
    return rows.length === 1 && cols.length === 1;
  }

  static checkRenderable([
    {
      data: { cols, rows },
    },
  ]) {
    if (!isNumeric(cols[0])) {
      throw new Error(t`Gauge visualization requires a number.`);
    }
  }

  state = {
    mounted: false,
  };

  _label: ?HTMLElement;

  static settings = {
    ...columnSettings({
      getColumns: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => [
        _.find(cols, col => col.name === settings["scalar.field"]) || cols[0],
      ],
    }),
    "gauge.range": {
      // currently not exposed in settings, just computed from gauge.segments
      getDefault(series, vizSettings) {
        const segments = vizSettings["gauge.segments"].filter(segmentIsValid);
        const values = [
          ...segments.map(s => s.max),
          ...segments.map(s => s.min),
        ];
        return values.length > 0
          ? [Math.min(...values), Math.max(...values)]
          : [0, 1];
      },
      readDependencies: ["gauge.segments"],
    },
    "gauge.segments": {
      section: "Display",
      title: t`Gauge ranges`,
      getDefault(series) {
        let value = 100;
        try {
          value = series[0].data.rows[0][0];
        } catch (e) {}
        return [
          { min: 0, max: value / 2, color: color("error"), label: "" },
          { min: value / 2, max: value, color: color("warning"), label: "" },
          { min: value, max: value * 2, color: color("success"), label: "" },
        ];
      },
      widget: ChartSettingGaugeSegments,
      persistDefault: true,
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
    const label = this._label && ReactDOM.findDOMNode(this._label);
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
      series: [
        {
          data: { rows, cols },
        },
      ],
      settings,
      className,
      isSettings,
    } = this.props;

    const width = this.props.width;
    const height = this.props.height - PADDING_BOTTOM;

    const viewBoxHeight =
      (ARC_DEGREES > 180 ? 50 : 0) + Math.sin(radians(ARC_DEGREES / 2)) * 50;
    const viewBoxWidth = 100;

    const svgAspectRatio = viewBoxHeight / viewBoxWidth;
    const containerAspectRadio = height / width;

    let svgWidth;
    if (containerAspectRadio < svgAspectRatio) {
      svgWidth = Math.min(MAX_WIDTH, height / svgAspectRatio);
    } else {
      svgWidth = Math.min(MAX_WIDTH, width);
    }
    const svgHeight = svgWidth * svgAspectRatio;

    const showLabels = svgWidth > MIN_WIDTH_LABEL_THRESHOLD;

    const range = settings["gauge.range"];
    const segments = settings["gauge.segments"].filter(segmentIsValid);

    // value to angle in radians, clamped
    const angle = d3.scale
      .linear()
      .domain(range) // NOTE: confusing, but the "range" is the domain for the arc scale
      .range([
        ((ARC_DEGREES / 180) * -Math.PI) / 2,
        ((ARC_DEGREES / 180) * Math.PI) / 2,
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

    // expand the width to fill available space so that labels don't overflow as often
    const expandWidthFactor = width / svgWidth;

    return (
      <div className={cx(className, "relative")}>
        <div
          className="absolute overflow-hidden"
          style={{
            width: svgWidth * expandWidthFactor,
            height: svgHeight,
            top: (height - svgHeight) / 2,
            left:
              (width - svgWidth) / 2 -
              // shift to the left the
              (svgWidth * expandWidthFactor - svgWidth) / 2,
          }}
        >
          <svg
            viewBox={`0 0 ${viewBoxWidth * expandWidthFactor} ${viewBoxHeight}`}
          >
            <g
              transform={`translate(${(viewBoxWidth * expandWidthFactor) /
                2},50)`}
            >
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
                  segment={segment}
                  column={column}
                  settings={settings}
                  onHoverChange={!showLabels ? this.props.onHoverChange : null}
                />
              ))}
              {/* NEEDLE */}
              <GaugeNeedle
                angle={angle(this.state.mounted ? value : 0)}
                isAnimated={!isSettings}
              />
              {/* NUMBER LABELS */}
              {showLabels &&
                numberLabels.map((value, index) => (
                  <GaugeSegmentLabel
                    position={valuePosition(
                      value,
                      OUTER_RADIUS * LABEL_OFFSET_PERCENT,
                    )}
                  >
                    {formatValue(value, settings.column(column))}
                  </GaugeSegmentLabel>
                ))}
              {/* TEXT LABELS */}
              {showLabels &&
                textLabels.map(({ label, value }, index) => (
                  <HideIfOverlowingSVG>
                    <GaugeSegmentLabel
                      position={valuePosition(
                        value,
                        OUTER_RADIUS * LABEL_OFFSET_PERCENT,
                      )}
                      style={{
                        fill: SEGMENT_LABEL_COLOR,
                      }}
                    >
                      {label}
                    </GaugeSegmentLabel>
                  </HideIfOverlowingSVG>
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
                {formatValue(value, settings.column(column))}
              </text>
            </g>
          </svg>
        </div>
      </div>
    );
  }
}

const GaugeArc = ({
  start,
  end,
  fill,
  segment,
  onHoverChange,
  settings,
  column,
}) => {
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
      onMouseMove={e => {
        if (onHoverChange) {
          const options =
            settings && settings.column && column
              ? settings.column(column)
              : {};
          onHoverChange({
            data: [
              {
                key: segment.label,
                value: [segment.min, segment.max]
                  .map(n => formatValue(n, options))
                  .join(" - "),
              },
            ],
            event: e.nativeEvent,
          });
        }
      }}
      onMouseLeave={() => {
        if (onHoverChange) {
          onHoverChange(null);
        }
      }}
    />
  );
};

const GaugeNeedle = ({ angle, isAnimated = true }) => (
  <path
    d={`M-${ARROW_BASE} 0 L0 -${ARROW_HEIGHT} L${ARROW_BASE} 0 Z`}
    transform={`translate(0,-${INNER_RADIUS}) rotate(${degrees(
      angle,
    )}, 0, ${INNER_RADIUS})`}
    style={isAnimated ? { transition: "transform 1.5s ease-in-out" } : null}
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
      fill: color("text-medium"),
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

class HideIfOverlowingSVG extends React.Component {
  componentDidMount() {
    this._hideIfClipped();
  }
  componentDidUpdate() {
    this._hideIfClipped();
  }
  _hideIfClipped() {
    const element = ReactDOM.findDOMNode(this);
    if (element) {
      let svg = element;
      while (svg.nodeName.toLowerCase() !== "svg") {
        svg = svg.parentNode;
      }
      const svgRect = svg.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      if (
        elementRect.left >= svgRect.left &&
        elementRect.right <= svgRect.right &&
        elementRect.top >= svgRect.top &&
        elementRect.bottom <= svgRect.bottom
      ) {
        element.classList.remove("hidden");
      } else {
        element.classList.add("hidden");
      }
    }
  }
  render() {
    return this.props.children;
  }
}

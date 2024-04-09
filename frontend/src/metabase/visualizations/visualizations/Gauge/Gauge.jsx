/* eslint-disable react/prop-types */
import cx from "classnames";
import d3 from "d3";
import { Component } from "react";
import * as React from "react";
import ReactDOM from "react-dom";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import ChartSettingGaugeSegments from "metabase/visualizations/components/settings/ChartSettingGaugeSegments";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

import { GaugeArcPath } from "./Gauge.styled";
import { getValue } from "./utils";

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
const getBackgroundArcColor = () => color("bg-medium");
const getSegmentLabelColor = () => color("text-dark");
const getCenterLabelColor = () => color("text-dark");
const getArrowFillColor = () => color("text-medium");
const getArrowStrokeColor = () => "white";

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
  static uiName = t`Gauge`;
  static identifier = "gauge";
  static iconName = "gauge";

  static minSize = getMinSize("gauge");
  static defaultSize = getDefaultSize("gauge");

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

  _label;

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
      section: t`Display`,
      title: t`Gauge ranges`,
      getDefault(series) {
        let value = 100;
        try {
          value = series[0].data.rows[0][0] || 0;
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
      onHoverChange,
      visualizationIsClickable,
      onVisualizationClick,
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

    const value = getValue(rows);
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
      <div className={cx(className, CS.relative)}>
        <div
          className={cx(CS.absolute, CS.overflowHidden)}
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
              transform={`translate(${
                (viewBoxWidth * expandWidthFactor) / 2
              },50)`}
            >
              {/* BACKGROUND ARC */}
              <GaugeArc
                start={angle(range[0])}
                end={angle(range[1])}
                fill={getBackgroundArcColor()}
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
                  visualizationIsClickable={visualizationIsClickable}
                  testId={"gauge-arc-" + index}
                  onHoverChange={!showLabels ? onHoverChange : null}
                  onVisualizationClick={onVisualizationClick}
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
                    key={index}
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
                  <HideIfOverlowingSVG key={index}>
                    <GaugeSegmentLabel
                      position={valuePosition(
                        value,
                        OUTER_RADIUS * LABEL_OFFSET_PERCENT,
                      )}
                      style={{
                        fill: getSegmentLabelColor(),
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
                  fill: getCenterLabelColor(),
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
  settings,
  column,
  visualizationIsClickable,
  testId,
  onHoverChange,
  onVisualizationClick,
}) => {
  const arc = d3.svg
    .arc()
    .outerRadius(OUTER_RADIUS)
    .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

  const clicked = segment && { value: segment.min, column, settings };
  const isClickable = clicked && onVisualizationClick != null;
  const options = column && settings?.column ? settings.column(column) : {};
  const range = segment ? [segment.min, segment.max] : [];
  const value = range.map(v => formatValue(v, options)).join(" - ");
  const hovered = segment ? { data: [{ key: segment.label, value }] } : {};

  const handleClick = e => {
    if (onVisualizationClick && visualizationIsClickable(clicked)) {
      onVisualizationClick({ ...clicked, event: e.nativeEvent });
    }
  };

  const handleMouseMove = e => {
    if (onHoverChange) {
      onHoverChange({ ...hovered, event: e.nativeEvent });
    }
  };

  const handleMouseLeave = () => {
    if (onHoverChange) {
      onHoverChange(null);
    }
  };

  return (
    <GaugeArcPath
      d={arc({
        startAngle: start,
        endAngle: end,
      })}
      fill={fill}
      isClickable={isClickable}
      data-testid={testId}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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
    stroke={getArrowStrokeColor()}
    strokeWidth={ARROW_STROKE_THICKNESS}
    fill={getArrowFillColor()}
  />
);

const GaugeSegmentLabel = ({ position: [x, y], style = {}, children }) => (
  <text
    x={x}
    y={y}
    style={{
      fill: color("text-medium"),
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}rem`,
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
        element.classList.remove(CS.hidden);
      } else {
        element.classList.add(CS.hidden);
      }
    }
  }
  render() {
    return this.props.children;
  }
}

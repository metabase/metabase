/* eslint-disable react/prop-types */
import cx from "classnames";
import Color from "color";
import * as d3 from "d3";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import * as React from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { ChartSettingSegmentsEditor } from "metabase/visualizations/components/settings/ChartSettingSegmentsEditor";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";

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
const getBackgroundArcColor = () => color("background-tertiary");
const getSegmentLabelColor = () => color("text-primary");
const getCenterLabelColor = () => color("text-primary");
const getArrowFillColor = () => color("text-secondary-opaque");
const getArrowStrokeColor = () => color("background-primary");

// in px, because scaling was not working well with PDF Exports (metabase#65322)
const FONT_SIZE_SEGMENT_LABEL = 4;

// in ems, but within the scaled 100px SVG element
const FONT_SIZE_CENTER_LABEL_MIN = 0.5;
const FONT_SIZE_CENTER_LABEL_MAX = 0.7;

// hide labels if SVG width is smaller than this
const MIN_WIDTH_LABEL_THRESHOLD = 250;

const LABEL_OFFSET_PERCENT = 1.025;

// total degrees of the arc (180 = semicircle, etc)
const ARC_DEGREES = 180 + 45 * 2; // semicircle plus a bit

const radians = (degrees) => (degrees * Math.PI) / 180;
const degrees = (radians) => (radians * 180) / Math.PI;

export class Gauge extends Component {
  static getUiName = () => t`Gauge`;
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
    if (!isNumeric(cols[0]) || isDate(cols[0])) {
      throw new Error(t`Gauge visualization requires a number.`);
    }
  }

  constructor(props) {
    super(props);

    /** @type {React.RefObject<SVGTextElement>} */
    this.labelRef = React.createRef();

    this.state = { mounted: false };
  }

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
        _.find(cols, (col) => col.name === settings["scalar.field"]) || cols[0],
      ],
    }),
    "gauge.range": {
      // currently not exposed in settings, just computed from gauge.segments
      getDefault(series, vizSettings) {
        const segments = vizSettings["gauge.segments"].filter(segmentIsValid);
        const values = [
          ...segments.map((s) => s.max),
          ...segments.map((s) => s.min),
        ];
        return values.length > 0
          ? [Math.min(...values), Math.max(...values)]
          : [0, 1];
      },
      readDependencies: ["gauge.segments"],
    },
    "gauge.segments": {
      get section() {
        return t`Ranges`;
      },
      getDefault(series) {
        let value = 100;
        try {
          value = series[0].data.rows[0][0] || 0;
        } catch (e) {}
        const errorColor = Color(color("error")).hex();
        const warningColor = Color(color("warning")).hex();
        const successColor = Color(color("success")).hex();
        return [
          { min: 0, max: value / 2, color: errorColor, label: "" },
          { min: value / 2, max: value, color: warningColor, label: "" },
          { min: value, max: value * 2, color: successColor, label: "" },
        ];
      },
      widget: ChartSettingSegmentsEditor,
      persistDefault: true,
      noPadding: true,
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
    const label = this.labelRef.current;
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
    const angle = d3
      .scaleLinear()
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
        range.concat(...segments.map((segment) => [segment.min, segment.max])),
      ),
    );

    const textLabels = segments
      .filter((segment) => segment.label)
      .map((segment) => ({
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
                  <HideIfOverflowingSVG key={index}>
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
                  </HideIfOverflowingSVG>
                ))}
              {/* CENTER LABEL */}
              {/* NOTE: can't be a component because ref doesn't work? */}
              <text
                ref={this.labelRef}
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
  const arc = d3
    .arc()
    .outerRadius(OUTER_RADIUS)
    .innerRadius(OUTER_RADIUS * INNER_RADIUS_RATIO);

  const isClickable = segment != null && onVisualizationClick != null;
  const options = column && settings?.column ? settings.column(column) : {};
  const range = segment ? [segment.min, segment.max] : [];
  const value = range.map((v) => formatValue(v, options)).join(" - ");
  const hovered = segment ? { data: [{ key: segment.label, value }] } : {};

  const handleClick = (e) => {
    if (!segment) {
      return;
    }
    const clickData = {
      value: segment.min,
      column,
      settings,
      event: e.nativeEvent,
    };
    if (onVisualizationClick && visualizationIsClickable(clickData)) {
      onVisualizationClick(clickData);
    }
  };

  const handleMouseMove = (e) => {
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
  <g
    transform={`rotate(${degrees(angle)})`}
    style={isAnimated ? { transition: "transform 1.5s ease-in-out" } : null}
  >
    <path
      d={`M-${ARROW_BASE} 0 L0 -${ARROW_HEIGHT} L${ARROW_BASE} 0 Z`}
      transform={`translate(0,-${INNER_RADIUS})`}
      style={isAnimated ? { transition: "transform 1.5s ease-in-out" } : null}
      stroke={getArrowStrokeColor()}
      strokeWidth={ARROW_STROKE_THICKNESS}
      fill={getArrowFillColor()}
    />
  </g>
);

const GaugeSegmentLabel = ({ position: [x, y], style = {}, children }) => (
  <text
    x={x}
    y={y}
    style={{
      fill: "var(--mb-color-text-secondary)",
      fontSize: `${FONT_SIZE_SEGMENT_LABEL}px`,
      textAnchor: Math.abs(x) < 5 ? "middle" : x > 0 ? "start" : "end",
      // shift text in the lower half down a bit
      transform:
        y > 0 ? `translate(0,${FONT_SIZE_SEGMENT_LABEL / 2}px)` : undefined,
      ...style,
    }}
  >
    {children}
  </text>
);

const HideIfOverflowingSVG = ({ children }) => {
  const elementRef = useRef(null);
  const [isHidden, setIsHidden] = useState(false);

  const hideIfClipped = useCallback(() => {
    const element = elementRef.current;

    if (element) {
      let svg = element;

      while (svg && svg.nodeName.toLowerCase() !== "svg") {
        svg = svg.parentNode;
      }

      if (svg) {
        const svgRect = svg.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        const shouldBeHidden = !(
          elementRect.left >= svgRect.left &&
          elementRect.right <= svgRect.right &&
          elementRect.top >= svgRect.top &&
          elementRect.bottom <= svgRect.bottom
        );

        setIsHidden(shouldBeHidden);
      }
    }
  }, []);

  useEffect(() => {
    hideIfClipped();
  });

  return (
    <g ref={elementRef} className={isHidden ? CS.hidden : undefined}>
      {children}
    </g>
  );
};

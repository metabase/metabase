/* eslint-disable react/prop-types */
import cx from "classnames";
import d3 from "d3";
import { createRef, Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { color } from "metabase/lib/colors";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { formatValue } from "metabase/lib/formatting";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import {
  ChartSettingsError,
  MinRowsError,
} from "metabase/visualizations/lib/errors";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  metricSetting,
  dimensionSetting,
} from "metabase/visualizations/lib/settings/utils";
import {
  getFriendlyName,
  computeMaxDecimalsForValues,
} from "metabase/visualizations/lib/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import ChartWithLegend from "../../components/ChartWithLegend";

import { PieArc } from "./PieArc";
import styles from "./PieChart.module.css";
import { getTooltipModel } from "./utils";

const SIDE_PADDING = 24;
const MAX_LABEL_FONT_SIZE = 20;
const MIN_LABEL_FONT_SIZE = 14;
const MAX_PIE_SIZE = 550;

const INNER_RADIUS_RATIO = 3 / 5;

const PAD_ANGLE = (Math.PI / 180) * 1; // 1 degree in radians
const SLICE_THRESHOLD = 0.025; // approx 1 degree in percentage
const OTHER_SLICE_MIN_PERCENTAGE = 0.003;

export default class PieChart extends Component {
  constructor(props) {
    super(props);

    this.state = { width: 0, height: 0, showChartDetail: true };

    this.chartContainer = createRef();
    this.chartDetail = createRef();
    this.chartGroup = createRef();
  }

  static uiName = t`Pie`;
  static identifier = "pie";
  static iconName = "pie";

  static minSize = getMinSize("pie");
  static defaultSize = getDefaultSize("pie");

  static isSensible({ cols, rows }) {
    return cols.length === 2;
  }

  static checkRenderable(
    [
      {
        data: { cols, rows },
      },
    ],
    settings,
  ) {
    // This prevents showing "Which columns do you want to use" when
    // the piechart is displayed with no results in the dashboard
    if (rows.length < 1) {
      throw new MinRowsError(1, 0);
    }
    if (!settings["pie.dimension"] || !settings["pie.metric"]) {
      throw new ChartSettingsError(t`Which columns do you want to use?`, {
        section: `Data`,
      });
    }
  }

  static placeholderSeries = [
    {
      card: {
        display: "pie",
        visualization_settings: { "pie.show_legend": false },
        dataset_query: { type: "null" },
      },
      data: {
        rows: [
          ["Doohickey", 3976],
          ["Gadget", 4939],
          ["Gizmo", 4784],
          ["Widget", 5061],
        ],
        cols: [
          { name: "Category", base_type: "type/Category" },
          { name: "Count", base_type: "type/Integer" },
        ],
      },
    },
  ];

  static settings = {
    ...columnSettings({ hidden: true }),
    ...dimensionSetting("pie.dimension", {
      section: t`Data`,
      title: t`Dimension`,
      showColumnSetting: true,
    }),
    ...metricSetting("pie.metric", {
      section: t`Data`,
      title: t`Measure`,
      showColumnSetting: true,
    }),
    "pie.show_legend": {
      section: t`Display`,
      title: t`Show legend`,
      widget: "toggle",
      default: true,
      inline: true,
      marginBottom: "1rem",
    },
    "pie.show_total": {
      section: t`Display`,
      title: t`Show total`,
      widget: "toggle",
      default: true,
      inline: true,
    },
    "pie.percent_visibility": {
      section: t`Display`,
      title: t`Show percentages`,
      widget: "radio",
      default: "legend",
      props: {
        options: [
          { name: t`Off`, value: "off" },
          { name: t`In legend`, value: "legend" },
          { name: t`On the chart`, value: "inside" },
        ],
      },
    },
    "pie.slice_threshold": {
      section: t`Display`,
      title: t`Minimum slice percentage`,
      widget: "number",
      default: SLICE_THRESHOLD * 100,
    },
    "pie.colors": {
      section: t`Display`,
      title: t`Colors`,
      widget: "colors",
      getDefault: (series, settings) =>
        settings["pie._dimensionValues"]
          ? getColorsForValues(settings["pie._dimensionValues"])
          : [],
      getProps: (series, settings) => ({
        seriesValues: settings["pie._dimensionValues"] || [],
        seriesTitles: settings["pie._dimensionTitles"] || [],
      }),
      getDisabled: (series, settings) => !settings["pie._dimensionValues"],
      readDependencies: ["pie._dimensionValues", "pie._dimensionTitles"],
    },
    // this setting recomputes color assignment using pie.colors as the existing
    // assignments in case the user previous modified pie.colors and a new value
    // has appeared. Not ideal because those color values will be missing in the
    // settings UI
    "pie._colors": {
      getValue: (series, settings) =>
        getColorsForValues(
          settings["pie._dimensionValues"],
          settings["pie.colors"],
        ),
      readDependencies: ["pie._dimensionValues", "pie.colors"],
    },
    "pie._metricIndex": {
      getValue: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => _.findIndex(cols, col => col.name === settings["pie.metric"]),
      readDependencies: ["pie.metric"],
    },
    "pie._dimensionIndex": {
      getValue: (
        [
          {
            data: { cols },
          },
        ],
        settings,
      ) => _.findIndex(cols, col => col.name === settings["pie.dimension"]),
      readDependencies: ["pie.dimension"],
    },
    "pie._dimensionValues": {
      getValue: (
        [
          {
            data: { rows },
          },
        ],
        settings,
      ) => {
        const dimensionIndex = settings["pie._dimensionIndex"];
        if (dimensionIndex == null || dimensionIndex < 0) {
          return null;
        }

        return rows.map(row => String(row[dimensionIndex]));
      },
      readDependencies: ["pie._dimensionIndex"],
    },
    "pie._dimensionTitles": {
      getValue: (
        [
          {
            data: { rows, cols },
          },
        ],
        settings,
      ) => {
        const dimensionIndex = settings["pie._dimensionIndex"];
        if (dimensionIndex == null || dimensionIndex < 0) {
          return null;
        }

        return rows.map(row =>
          formatValue(
            row[dimensionIndex],
            settings.column(cols[dimensionIndex]),
          ),
        );
      },
      readDependencies: ["pie._dimensionIndex"],
    },
  };

  updateChartViewportSize = () => {
    // Measure chart viewport dimensions in the next tick to wait for DOM elements to resize
    setTimeout(() => {
      if (!this.chartContainer.current) {
        return;
      }

      const { width, height } =
        this.chartContainer.current.getBoundingClientRect();

      this.setState({
        width,
        height,
      });
    });
  };

  componentDidMount() {
    this.updateChartViewportSize();
  }

  componentDidUpdate(prevProps) {
    requestAnimationFrame(() => {
      const groupElement = this.chartGroup.current;
      const detailElement = this.chartDetail.current;
      const { settings } = this.props;

      if (!groupElement || !detailElement) {
        return;
      }

      const showChartDetail =
        groupElement.getBoundingClientRect().width >= 120 &&
        settings["pie.show_total"];

      if (showChartDetail !== this.state.showChartDetail) {
        this.setState({ showChartDetail });
      }
    });

    if (
      prevProps.width !== this.props.width ||
      prevProps.height !== this.props.height
    ) {
      this.updateChartViewportSize();
    }
  }

  render() {
    const {
      series,
      hovered,
      onHoverChange,
      visualizationIsClickable,
      onVisualizationClick,
      className,
      gridSize,
      settings,
    } = this.props;

    const { width, height } = this.state;

    const [
      {
        data: { cols, rows },
      },
    ] = series;
    const dimensionIndex = settings["pie._dimensionIndex"];
    const metricIndex = settings["pie._metricIndex"];

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

    const total = rows.reduce((sum, row) => sum + row[metricIndex], 0);

    const sliceThreshold =
      typeof settings["pie.slice_threshold"] === "number"
        ? settings["pie.slice_threshold"] / 100
        : SLICE_THRESHOLD;

    const [slices, others] = _.chain(rows)
      .map((row, index) => ({
        key: row[dimensionIndex],
        // Value is used to determine arc size and is modified for very small
        // other slices. We save displayValue for use in tooltips.
        value: row[metricIndex],
        displayValue: row[metricIndex],
        percentage: row[metricIndex] / total,
        rowIndex: index,
        color: settings["pie._colors"][row[dimensionIndex]],
      }))
      .partition(d => d.percentage > sliceThreshold)
      .value();

    const otherTotal = others.reduce((acc, o) => acc + o.value, 0);
    // Multiple others get squashed together under the key "Other"
    let otherSlice =
      others.length === 1
        ? others[0]
        : {
            key: t`Other`,
            value: otherTotal,
            displayValue: otherTotal,
            percentage: otherTotal / total,
            color: color("text-light"),
          };
    if (otherSlice.value > 0) {
      // increase "other" slice so it's barely visible
      if (otherSlice.percentage < OTHER_SLICE_MIN_PERCENTAGE) {
        otherSlice.value = total * OTHER_SLICE_MIN_PERCENTAGE;
      }
      slices.push(otherSlice);
    }

    const percentages = slices.map(s => s.percentage);
    const legendDecimals = computeMaxDecimalsForValues(percentages, {
      style: "percent",
      maximumSignificantDigits: 3,
    });
    const labelsDecimals = computeMaxDecimalsForValues(percentages, {
      style: "percent",
      maximumSignificantDigits: 2,
    });

    const formatPercent = (percent, decimals) =>
      formatValue(percent, {
        column: cols[metricIndex],
        number_separators: settings.column(cols[metricIndex]).number_separators,
        jsx: true,
        majorWidth: 0,
        number_style: "percent",
        decimals,
      });

    const legendTitles = slices.map(slice => [
      slice.key === "Other" ? slice.key : formatDimension(slice.key, true),
      settings["pie.percent_visibility"] === "legend"
        ? formatPercent(slice.percentage, legendDecimals)
        : undefined,
    ]);
    const legendColors = slices.map(slice => slice.color);

    // no non-zero slices
    if (slices.length === 0) {
      otherSlice = {
        value: 1,
        color: color("text-light"),
        noHover: true,
      };
      slices.push(otherSlice);
    }

    const side = Math.max(
      Math.min(Math.min(width, height) - SIDE_PADDING, MAX_PIE_SIZE),
      0,
    );

    const outerRadius = side / 2;
    const labelFontSize = Math.max(
      MAX_LABEL_FONT_SIZE * (side / MAX_PIE_SIZE),
      MIN_LABEL_FONT_SIZE,
    );

    /** @type {d3.layout.Pie<typeof slices[number]>} */
    const pie = d3.layout
      .pie()
      .sort(null)
      .padAngle(PAD_ANGLE)
      .value(d => d.value);
    const arc = d3.svg
      .arc()
      .outerRadius(outerRadius)
      .innerRadius(outerRadius * INNER_RADIUS_RATIO);

    function hoverForIndex(index, event) {
      const slice = slices[index];
      if (!slice || slice.noHover) {
        return null;
      }

      if (slice === otherSlice && others.length > 1) {
        return {
          index,
          event: event && event.nativeEvent,
          stackedTooltipModel: getTooltipModel(
            others.map(o => ({
              ...o,
              key: formatDimension(o.key, false),
              value: o.displayValue,
              color: undefined,
            })),
            null,
            getFriendlyName(cols[dimensionIndex]),
            formatDimension,
            formatMetric,
            total,
          ),
        };
      } else {
        return {
          index,
          event: event && event.nativeEvent,
          stackedTooltipModel: getTooltipModel(
            slices,
            index,
            getFriendlyName(cols[dimensionIndex]),
            formatDimension,
            formatMetric,
          ),
        };
      }
    }

    let value, title;
    if (
      hovered &&
      hovered.index != null &&
      slices[hovered.index] !== otherSlice
    ) {
      title = formatDimension(slices[hovered.index].key);
      value = formatMetric(slices[hovered.index].value);
    } else {
      title = t`Total`;
      value = formatMetric(total);
    }

    const getSliceClickObject = index => {
      const slice = slices[index];
      const sliceRows = slice.rowIndex != null && rows[slice.rowIndex];
      const data =
        sliceRows &&
        sliceRows.map((value, index) => ({
          value,
          col: cols[index],
        }));

      return {
        value: slice.value,
        column: cols[metricIndex],
        data: data,
        dimensions: [
          {
            value: slice.key,
            column: cols[dimensionIndex],
          },
        ],
        settings,
      };
    };

    const isClickable = onVisualizationClick != null;
    const shouldRenderLabels = settings["pie.percent_visibility"] === "inside";

    const handleSliceClick = (e, index) => {
      if (onVisualizationClick) {
        const isSliceClickable =
          visualizationIsClickable(getSliceClickObject(index)) &&
          slices[index] !== otherSlice;

        if (isSliceClickable) {
          onVisualizationClick({
            ...getSliceClickObject(index),
            event: e.nativeEvent,
          });
        }
      }
    };

    return (
      <ChartWithLegend
        className={className}
        legendTitles={legendTitles}
        legendColors={legendColors}
        gridSize={gridSize}
        hovered={hovered}
        onHoverChange={d =>
          onHoverChange &&
          onHoverChange(d && { ...d, ...hoverForIndex(d.index) })
        }
        showLegend={settings["pie.show_legend"]}
        isDashboard={this.props.isDashboard}
        onUpdateSize={this.updateChartViewportSize}
      >
        <div>
          <div ref={this.chartDetail} className={styles.Detail}>
            {this.state.showChartDetail && (
              <>
                <div
                  data-testid="detail-value"
                  className={cx(
                    styles.Value,
                    DashboardS.fullscreenNormalText,
                    DashboardS.fullscreenNightText,
                    EmbedFrameS.fullscreenNightText,
                  )}
                >
                  {value}
                </div>
                <div className={styles.Title}>{title}</div>
              </>
            )}
          </div>
          <div
            ref={this.chartContainer}
            className={cx(styles.Chart, CS.layoutCentered)}
          >
            <svg
              data-testid="pie-chart"
              width={side}
              height={side}
              style={{ maxWidth: MAX_PIE_SIZE, maxHeight: MAX_PIE_SIZE }}
            >
              <g
                ref={this.chartGroup}
                transform={`translate(${outerRadius},${outerRadius})`}
              >
                {pie(slices).map((slice, index) => {
                  const label = formatPercent(
                    slice.data.percentage,
                    labelsDecimals,
                  );

                  return (
                    <PieArc
                      key={index}
                      shouldRenderLabel={shouldRenderLabels}
                      d3Arc={arc}
                      slice={slice}
                      label={label}
                      labelFontSize={labelFontSize}
                      fill={slice.data.color}
                      opacity={
                        hovered &&
                        hovered.index != null &&
                        hovered.index !== index
                          ? 0.3
                          : 1
                      }
                      onMouseMove={e =>
                        onHoverChange?.(hoverForIndex(index, e))
                      }
                      onMouseLeave={() => onHoverChange?.(null)}
                      className={cx({
                        [CS.cursorPointer]: isClickable,
                      })}
                      onClick={e => handleSliceClick(e, index)}
                      data-testid="slice"
                    />
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
      </ChartWithLegend>
    );
  }
}

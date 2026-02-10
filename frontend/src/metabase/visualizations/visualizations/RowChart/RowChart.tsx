import type * as React from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";

import { ExplicitSize } from "metabase/common/components/ExplicitSize";
import CS from "metabase/css/core/index.css";
import { measureTextWidth } from "metabase/lib/measure-text";
import { extractRemappedColumns } from "metabase/visualizations";
import {
  getCartesianChartColumns,
  hasValidColumnsSelected,
} from "metabase/visualizations/lib/graph/columns";
import { getChartGoal } from "metabase/visualizations/lib/settings/goal";
import { GRAPH_DATA_SETTINGS } from "metabase/visualizations/lib/settings/graph";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import {
  getBreakoutCardinality,
  validateBreakoutSeriesCount,
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { MAX_SERIES } from "metabase/visualizations/lib/utils";
import type { RowChartProps } from "metabase/visualizations/shared/components/RowChart";
import { RowChart } from "metabase/visualizations/shared/components/RowChart";
import type { BarData } from "metabase/visualizations/shared/components/RowChart/types";
import type {
  GroupedDatum,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import type { HoveredData } from "metabase/visualizations/shared/types/events";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";
import {
  getGroupedDataset,
  getSeries,
  trimData,
} from "metabase/visualizations/shared/utils/data";
import { getTwoDimensionalChartSeries } from "metabase/visualizations/shared/utils/series";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ComputedVisualizationSettings,
  RemappingHydratedChartData,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  getClickData,
  getHoverData,
  getLegendClickData,
} from "metabase/visualizations/visualizations/RowChart/utils/events";
import { useRowChartTheme } from "metabase/visualizations/visualizations/RowChart/utils/theme";
import {
  hasLatitudeAndLongitudeColumns,
  isDimension,
  isMetric,
} from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import {
  RowChartContainer,
  RowChartLegendLayout,
  RowLegendCaption,
  RowVisualizationRoot,
} from "./RowChart.styled";
import {
  getColumnValueFormatter,
  getFormatters,
  getLabelsFormatter,
} from "./utils/format";
import { getLegendItems } from "./utils/legend";
import {
  getAxesVisibility,
  getLabelledSeries,
  getLabels,
  getXValueRange,
} from "./utils/settings";
import { ROW_CHART_SETTINGS } from "./utils/settings-definitions";
import { getChartWarnings } from "./utils/warnings";

interface RowChartRendererProps extends RowChartProps<GroupedDatum> {
  className?: string;
}

function RowChartRendererInner(props: RowChartRendererProps) {
  return (
    <RowChartContainer data-testid="row-chart-container">
      <RowChart {...props} />
    </RowChartContainer>
  );
}

const RowChartRenderer = ExplicitSize<RowChartRendererProps>({
  wrapped: true,
  refreshMode: "throttle",
})(RowChartRendererInner);

const RowChartVisualization = ({
  card,
  className,
  settings,
  visualizationIsClickable,
  onVisualizationClick,
  hovered,
  headerIcon,
  actionButtons,
  isFullscreen,
  isQueryBuilder,
  isDashboard,
  onRender,
  onHoverChange,
  showTitle,
  onChangeCardAndRun,
  rawSeries: rawMultipleSeries,
  fontFamily,
  width: outerWidth,
  height: outerHeight,
  getHref,
}: VisualizationProps) => {
  const formatColumnValue = useMemo(() => {
    return getColumnValueFormatter();
  }, []);
  const [chartSeries] = rawMultipleSeries;

  const data = useMemo(
    () =>
      extractRemappedColumns(chartSeries.data) as RemappingHydratedChartData,
    [chartSeries.data],
  );

  const { chartColumns, series, seriesColors } = useMemo(
    () => getTwoDimensionalChartSeries(data, settings, formatColumnValue),
    [data, formatColumnValue, settings],
  );

  const groupedData = useMemo(
    () =>
      getGroupedDataset(data.rows, chartColumns, settings, formatColumnValue),
    [chartColumns, data, settings, formatColumnValue],
  );
  const goal = useMemo(() => getChartGoal(settings), [settings]);
  const stackOffset = getStackOffset(settings);
  const theme = useRowChartTheme(
    `${fontFamily}, Arial, sans-serif`,
    isDashboard,
  );

  const chartWarnings = useMemo(
    () => getChartWarnings(chartColumns, data.rows),
    [chartColumns, data.rows],
  );

  useEffect(
    function warnOnRendered() {
      onRender({ warnings: chartWarnings });
    },
    [chartWarnings, onRender],
  );

  const tickFormatters = useMemo(
    () => getFormatters(chartColumns, settings),
    [chartColumns, settings],
  );

  const labelsFormatter = useMemo(
    () => getLabelsFormatter(chartColumns, settings),
    [chartColumns, settings],
  );

  const handleClick = (
    event: React.MouseEvent,
    bar: BarData<GroupedDatum, SeriesInfo>,
  ) => {
    if (!bar.datum.isClickable) {
      return;
    }

    const clickData = getClickData(bar, settings, chartColumns, data.cols);
    onVisualizationClick({ ...clickData, element: event.currentTarget });
  };

  const handleHover = (
    event: React.MouseEvent,
    bar: BarData<GroupedDatum, SeriesInfo> | null,
  ) => {
    if (bar == null) {
      onHoverChange?.(null);
      return;
    }
    const hoverData = getHoverData(
      bar,
      settings,
      chartColumns,
      data.cols,
      series,
      seriesColors,
    );

    onHoverChange?.({
      ...hoverData,
      // since we already scaled the dataset, we do not want the tool-tip
      // formatter to apply scaling a second time
      isAlreadyScaled: true,
      event: event.nativeEvent,
      element: event.currentTarget,
    });
  };

  const openQuestion = () => {
    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
      });
    }
  };

  const handleSelectSeries = (event: React.MouseEvent, seriesIndex: number) => {
    const clickData = {
      ...getLegendClickData(seriesIndex, series, settings, chartColumns),
      element: event.currentTarget,
    };

    const areMultipleCards = rawMultipleSeries.length > 1;
    if (areMultipleCards) {
      openQuestion();
      return;
    }

    if ("breakout" in chartColumns && visualizationIsClickable(clickData)) {
      onVisualizationClick(clickData);
    } else if (isDashboard) {
      openQuestion();
    }
  };

  const hoverData: HoveredData | null =
    hovered?.index != null
      ? {
          seriesIndex: hovered?.index,
          datumIndex: hovered?.datumIndex,
        }
      : null;

  const hasTitle = showTitle && settings["card.title"];
  const title = settings["card.title"] || card.name;
  const description = settings["card.description"];
  const canSelectTitle = !!onChangeCardAndRun;

  const legendItems = useMemo(
    () => getLegendItems(series, seriesColors),
    [series, seriesColors],
  );

  const { xLabel, yLabel } = useMemo(() => getLabels(settings), [settings]);

  const xValueRange = useMemo(() => getXValueRange(settings), [settings]);

  const labelledSeries = useMemo(
    () => getLabelledSeries(settings, series),
    [series, settings],
  );

  const { hasXAxis, hasYAxis } = useMemo(
    () => getAxesVisibility(settings),
    [settings],
  );

  const textMeasurer = useMemo(() => {
    return (text: string, style: FontStyle) =>
      measureTextWidth(text, {
        ...style,
        family: fontFamily,
      });
  }, [fontFamily]);

  const hasBreakout =
    settings["graph.dimensions"] && settings["graph.dimensions"]?.length > 1;
  const hasLegend = series.length > 1 || hasBreakout;

  return (
    <RowVisualizationRoot className={className} isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <RowLegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          onSelectTitle={canSelectTitle ? openQuestion : undefined}
          width={outerWidth}
          getHref={getHref}
        />
      )}
      <RowChartLegendLayout
        width={outerWidth}
        height={outerHeight}
        hasLegend={hasLegend}
        items={legendItems}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        onHoverChange={onHoverChange}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={handleSelectSeries}
      >
        <RowChartRenderer
          className={CS.flexFull}
          data={groupedData}
          trimData={trimData}
          series={series}
          seriesColors={seriesColors}
          goal={goal}
          theme={theme}
          stackOffset={stackOffset}
          tickFormatters={tickFormatters}
          labelsFormatter={labelsFormatter}
          measureTextWidth={textMeasurer}
          hoveredData={hoverData}
          onClick={handleClick}
          onHover={handleHover}
          xLabel={xLabel}
          yLabel={yLabel}
          xScaleType={settings["graph.y_axis.scale"]}
          xValueRange={xValueRange}
          labelledSeries={labelledSeries}
          hasXAxis={hasXAxis}
          hasYAxis={hasYAxis}
        />
      </RowChartLegendLayout>
    </RowVisualizationRoot>
  );
};

RowChartVisualization.getUiName = () => t`Row`;
RowChartVisualization.identifier = "row";
RowChartVisualization.iconName = "horizontal_bar";
// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
RowChartVisualization.noun = t`row chart`;

RowChartVisualization.noHeader = true;
RowChartVisualization.minSize = getMinSize("row");
RowChartVisualization.defaultSize = getDefaultSize("row");

RowChartVisualization.settings = {
  ...ROW_CHART_SETTINGS,
  ...GRAPH_DATA_SETTINGS,
};

RowChartVisualization.getSensibility = (data: DatasetData) => {
  const { cols, rows } = data;
  const dimensionCount = cols.filter(isDimension).length;
  const metricCount = cols.filter(isMetric).length;
  const hasAggregation = cols.some(
    (col) => col.source === "aggregation" || col.source === "native",
  );
  const hasLatLong = hasLatitudeAndLongitudeColumns(cols);

  if (
    rows.length <= 1 ||
    cols.length < 2 ||
    dimensionCount < 1 ||
    metricCount < 1
  ) {
    return "nonsensible";
  }
  if (!hasAggregation || hasLatLong) {
    return "sensible";
  }
  return "recommended";
};

RowChartVisualization.isLiveResizable = (series: any[]) => {
  const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
  return totalRows < 10;
};

RowChartVisualization.settings["graph.metrics"] = {
  ...RowChartVisualization.settings["graph.metrics"],
  get title() {
    return t`X-axis`;
  },
};
RowChartVisualization.settings["graph.dimensions"] = {
  ...RowChartVisualization.settings["graph.dimensions"],
  get title() {
    return t`Y-axis`;
  },
};

/**
 * Required to make it compatible with series settings without rewriting them fully
 * It expands a single card + dataset into multiple "series" and sets _seriesKey which is needed for settings to work
 */
RowChartVisualization.transformSeries = (originalMultipleSeries: any) => {
  const [series] = originalMultipleSeries;
  const settings: ComputedVisualizationSettings = getComputedSettingsForSeries(
    originalMultipleSeries,
  );
  const { card, data } = series;

  if (card._transformed || !hasValidColumnsSelected(settings, data)) {
    return originalMultipleSeries;
  }

  const cardinality = getBreakoutCardinality(data.cols, data.rows, settings);
  if (cardinality != null && cardinality > MAX_SERIES) {
    return originalMultipleSeries;
  }

  const chartColumns = getCartesianChartColumns(data.cols, settings);
  const seriesDefinitions = getSeries(
    data,
    chartColumns,
    getColumnValueFormatter(),
    settings,
  );

  const transformedSeries = seriesDefinitions.map((seriesDef) => ({
    card: {
      ...card,
      name: seriesDef.seriesName,
      _seriesKey: seriesDef.seriesKey,
      _transformed: true,
    },
    data: {
      ...data,
      cols: [
        seriesDef.seriesInfo?.dimensionColumn,
        seriesDef.seriesInfo?.metricColumn,
      ],
    },
  }));

  return transformedSeries.length > 0
    ? transformedSeries
    : originalMultipleSeries;
};

RowChartVisualization.checkRenderable = (
  series: any[],
  settings: VisualizationSettings,
) => {
  validateDatasetRows(series);
  validateBreakoutSeriesCount(series, settings);
  validateChartDataSettings(settings);
  validateStacking(settings);
};

RowChartVisualization.hasEmptyState = true;

RowChartVisualization.getUiName = () => t`Row`;

export { RowChartVisualization as RowChart };

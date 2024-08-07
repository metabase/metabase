import type * as React from "react";
import { useEffect, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ExplicitSize from "metabase/components/ExplicitSize";
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
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
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
  RemappingHydratedChartData,
  VisualizationProps,
} from "metabase/visualizations/types";
import {
  getClickData,
  getHoverData,
  getLegendClickData,
} from "metabase/visualizations/visualizations/RowChart/utils/events";
import { useRowChartTheme } from "metabase/visualizations/visualizations/RowChart/utils/theme";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { DatasetData, VisualizationSettings } from "metabase-types/api";

import {
  RowVisualizationRoot,
  RowChartContainer,
  RowChartLegendLayout,
  RowLegendCaption,
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
    <RowChartContainer>
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
  isPlaceholder,
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
  series: multipleSeries,
  fontFamily,
  width: outerWidth,
  height: outerHeight,
  getHref,
}: VisualizationProps) => {
  const formatColumnValue = useMemo(() => {
    return getColumnValueFormatter();
  }, []);
  const [chartSeries] = useMemo(() => {
    return isPlaceholder ? multipleSeries : rawMultipleSeries;
  }, [isPlaceholder, multipleSeries, rawMultipleSeries]);

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
  const theme = useRowChartTheme(fontFamily, isDashboard, isFullscreen);

  const chartWarnings = useMemo(
    () => getChartWarnings(chartColumns, data.rows),
    [chartColumns, data.rows],
  );

  useEffect(
    function warnOnRendered() {
      !isPlaceholder && onRender({ warnings: chartWarnings });
    },
    [chartWarnings, isPlaceholder, onRender],
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
    const clickData = getLegendClickData(
      seriesIndex,
      series,
      settings,
      chartColumns,
    );

    const areMultipleCards = rawMultipleSeries.length > 1;
    if (areMultipleCards) {
      openQuestion();
      return;
    }

    if ("breakout" in chartColumns && visualizationIsClickable(clickData)) {
      onVisualizationClick({
        ...clickData,
        element: event.currentTarget,
      });
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
    () => getLegendItems(series, seriesColors, settings),
    [series, seriesColors, settings],
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

RowChartVisualization.uiName = t`Row`;
RowChartVisualization.identifier = "row";
RowChartVisualization.iconName = "horizontal_bar";
RowChartVisualization.noun = t`row chart`;

RowChartVisualization.noHeader = true;
RowChartVisualization.minSize = getMinSize("row");
RowChartVisualization.defaultSize = getDefaultSize("row");

RowChartVisualization.settings = {
  ...ROW_CHART_SETTINGS,
  ...GRAPH_DATA_SETTINGS,
};

RowChartVisualization.isSensible = ({ cols, rows }: DatasetData) => {
  return (
    rows.length > 1 &&
    cols.length >= 2 &&
    cols.filter(isDimension).length > 0 &&
    cols.filter(isMetric).length > 0
  );
};

RowChartVisualization.isLiveResizable = (series: any[]) => {
  const totalRows = series.reduce((sum, s) => sum + s.data.rows.length, 0);
  return totalRows < 10;
};

RowChartVisualization.settings["graph.metrics"] = {
  ...RowChartVisualization.settings["graph.metrics"],
  title: t`X-axis`,
};
RowChartVisualization.settings["graph.dimensions"] = {
  ...RowChartVisualization.settings["graph.dimensions"],
  title: t`Y-axis`,
};

/**
 * Required to make it compatible with series settings without rewriting them fully
 * It expands a single card + dataset into multiple "series" and sets _seriesKey which is needed for settings to work
 */
RowChartVisualization.transformSeries = (originalMultipleSeries: any) => {
  const [series] = originalMultipleSeries;
  const settings: any = getComputedSettingsForSeries(originalMultipleSeries);
  const { card, data } = series;

  if (series.card._transformed || !hasValidColumnsSelected(settings, data)) {
    return originalMultipleSeries;
  }

  const chartColumns = getCartesianChartColumns(data.cols, settings);

  const computedSeries = getSeries(
    data,
    chartColumns,
    getColumnValueFormatter(),
  ).map(series => {
    const seriesCard = {
      ...card,
      name: series.seriesName,
      _seriesKey: series.seriesKey,
      _transformed: true,
    };

    const newData = {
      ...data,
      cols: [
        series.seriesInfo?.dimensionColumn,
        series.seriesInfo?.metricColumn,
      ],
    };

    return { card: seriesCard, data: newData };
  });

  return computedSeries.length > 0 ? computedSeries : originalMultipleSeries;
};

RowChartVisualization.checkRenderable = (
  series: any[],
  settings: VisualizationSettings,
) => {
  validateDatasetRows(series);
  validateChartDataSettings(settings);
  validateStacking(settings);
};

RowChartVisualization.placeholderSeries = [
  {
    card: {
      display: "row",
      visualization_settings: {
        "graph.metrics": ["x"],
        "graph.dimensions": ["y"],
      },
      dataset_query: { type: "null" },
    },
    data: {
      rows: _.range(0, 11).map(i => [i, i]),
      cols: [
        { name: "x", base_type: "type/Integer" },
        { name: "y", base_type: "type/Integer" },
      ],
    },
  },
];

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RowChartVisualization;

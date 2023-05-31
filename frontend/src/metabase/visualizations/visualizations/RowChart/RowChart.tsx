import React, { useEffect, useMemo } from "react";
import { t } from "ttag";

import _ from "underscore";
import { GRAPH_DATA_SETTINGS } from "metabase/visualizations/lib/settings/graph";
import { DatasetData, VisualizationSettings } from "metabase-types/api";

import {
  getChartColumns,
  hasValidColumnsSelected,
} from "metabase/visualizations/lib/graph/columns";
import { measureText } from "metabase/lib/measure-text";
import ExplicitSize from "metabase/components/ExplicitSize";
import {
  getClickData,
  getHoverData,
  getLegendClickData,
} from "metabase/visualizations/visualizations/RowChart/utils/events";

import { getChartTheme } from "metabase/visualizations/visualizations/RowChart/utils/theme";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import {
  RowChart,
  RowChartProps,
} from "metabase/visualizations/shared/components/RowChart";
import {
  getGroupedDataset,
  getSeries,
  trimData,
} from "metabase/visualizations/shared/utils/data";
import { getChartGoal } from "metabase/visualizations/lib/settings/goal";
import { getTwoDimensionalChartSeries } from "metabase/visualizations/shared/utils/series";
import { getStackOffset } from "metabase/visualizations/lib/settings/stacking";
import {
  GroupedDatum,
  RemappingHydratedChartData,
  SeriesInfo,
} from "metabase/visualizations/shared/types/data";
import { IconProps } from "metabase/core/components/Icon";
import {
  validateChartDataSettings,
  validateDatasetRows,
  validateStacking,
} from "metabase/visualizations/lib/settings/validation";
import { BarData } from "metabase/visualizations/shared/components/RowChart/types";
import { FontStyle } from "metabase/visualizations/shared/types/measure-text";
import { extractRemappedColumns } from "metabase/visualizations";
import { isDimension, isMetric } from "metabase-lib/types/utils/isa";
import { getChartWarnings } from "./utils/warnings";
import {
  RowVisualizationRoot,
  RowChartContainer,
  RowChartLegendLayout,
  RowLegendCaption,
} from "./RowChart.styled";
import { getLegendItems } from "./utils/legend";
import {
  getAxesVisibility,
  getLabelledSeries,
  getLabels,
  getXValueRange,
} from "./utils/settings";
import { ROW_CHART_SETTINGS } from "./utils/settings-definitions";
import {
  getColumnValueFormatter,
  getFormatters,
  getLabelsFormatter,
} from "./utils/format";

const RowChartRenderer = ExplicitSize({
  wrapped: true,
  refreshMode: "throttle",
  selector: false,
})((props: RowChartProps<GroupedDatum>) => (
  <RowChartContainer>
    <RowChart {...props} />
  </RowChartContainer>
));

interface RowChartVisualizationProps {
  className: string;
  width: number;
  height: number;
  rawSeries: { data: DatasetData }[];
  series: { data: DatasetData }[];
  settings: VisualizationSettings;
  visualizationIsClickable: (data: Record<string, unknown>) => boolean;
  onVisualizationClick: (data: Record<string, unknown>) => void;
  card: any;
  isPlaceholder?: boolean;
  hovered: any;
  headerIcon: IconProps;
  actionButtons: React.ReactNode;
  isFullscreen: boolean;
  isQueryBuilder: boolean;
  showTitle: boolean;
  onRender: (data: Record<string, unknown>) => void;
  onHoverChange: (data: Record<string, unknown> | null) => void;
  onChangeCardAndRun: (data: Record<string, unknown>) => void;
  fontFamily: string;
}

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
  onRender,
  onHoverChange,
  showTitle,
  onChangeCardAndRun,
  rawSeries: rawMultipleSeries,
  series: multipleSeries,
  fontFamily,
}: RowChartVisualizationProps) => {
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
    () => getGroupedDataset(data.rows, chartColumns, formatColumnValue),
    [chartColumns, data, formatColumnValue],
  );
  const goal = useMemo(() => getChartGoal(settings), [settings]);
  const theme = useMemo(getChartTheme, []);
  const stackOffset = getStackOffset(settings);

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
    onVisualizationClick({ ...clickData, element: event.target });
  };

  const handleHover = (
    event: React.MouseEvent,
    bar: BarData<GroupedDatum, SeriesInfo>,
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
      event: event.nativeEvent,
      element: event.target,
    });
  };

  const openQuestion = () => {
    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
        seriesIndex: 0,
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

    if ("breakout" in chartColumns && visualizationIsClickable(clickData)) {
      onVisualizationClick({
        ...clickData,
        element: event.currentTarget,
      });
    } else {
      openQuestion();
    }
  };

  const hoverData =
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

  const { labels, colors } = useMemo(
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
      measureText(text, {
        ...style,
        family: fontFamily,
      });
  }, [fontFamily]);

  return (
    <RowVisualizationRoot className={className} isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <RowLegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          onSelectTitle={canSelectTitle ? openQuestion : undefined}
        />
      )}
      <RowChartLegendLayout
        hasLegend={series.length > 1}
        labels={labels}
        colors={colors}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        onHoverChange={onHoverChange}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={handleSelectSeries}
      >
        <RowChartRenderer
          className="flex-full"
          data={groupedData}
          trimData={trimData}
          series={series}
          seriesColors={seriesColors}
          goal={goal}
          theme={theme}
          stackOffset={stackOffset}
          tickFormatters={tickFormatters}
          labelsFormatter={labelsFormatter}
          measureText={textMeasurer}
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
RowChartVisualization.minSize = { width: 5, height: 4 };
RowChartVisualization.defaultSize = { width: 5, height: 4 };

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

  const chartColumns = getChartColumns(data, settings);

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

import "./mock-environment";
import "fast-text-encoding";

import { setPlatformAPI } from "echarts/core";
import ReactDOMServer from "react-dom/server";
import _ from "underscore";

import "metabase/lib/dayjs";

import { updateStartOfWeek } from "metabase/lib/i18n";
import MetabaseSettings from "metabase/lib/settings";
import { StaticVisualization } from "metabase/static-viz/components/StaticVisualization";
import { createStaticRenderingContext } from "metabase/static-viz/lib/rendering-context";
import { measureTextEChartsAdapter } from "metabase/static-viz/lib/text";
import { extractRemappings } from "metabase/visualizations";
import { extendCardWithDashcardSettings } from "metabase/visualizations/lib/settings/typed-utils";
import {
  extractReferencedColumns,
  getDataSourceIdFromNameRef,
  isDataSourceNameRef,
  parseDataSourceId,
} from "metabase/visualizer/utils";

import { LegacyStaticChart } from "./containers/LegacyStaticChart";

setPlatformAPI({
  measureText: measureTextEChartsAdapter,
});

/**
 * @deprecated use RenderChart instead
 */
export function LegacyRenderChart(type, options) {
  return ReactDOMServer.renderToStaticMarkup(
    <LegacyStaticChart type={type} options={options} />,
  );
}

// Dashcard settings should be merged with the first card settings
// Replicates the logic from frontend/src/metabase/dashboard/components/DashCard/DashCard.tsx
function getRawSeriesWithDashcardSettings(rawSeries, dashcardSettings) {
  return rawSeries.map((series, index) => {
    const isMainCard = index === 0;
    if (isMainCard) {
      return {
        ...series,
        card: extendCardWithDashcardSettings(series.card, dashcardSettings),
      };
    }
    return series;
  });
}

// The function that combines both the data merging and series creation
function getVisualizerRawSeries(datasets, dashcardSettings) {
  const { columns, columnValuesMapping } = dashcardSettings.visualization;

  // Extract all referenced columns from the column mappings
  const referencedColumns = extractReferencedColumns(columnValuesMapping);

  // Create a map to store the actual values for each referenced column
  const referencedColumnValuesMap = {};

  // For each referenced column, find its values in the corresponding dataset
  referencedColumns.forEach(ref => {
    // Extract the source ID from references like "card:7166" -> "7166"
    const { sourceId } = parseDataSourceId(ref.sourceId);

    //const dataset = datasets[sourceId];
    const dataset = datasets.find(d => d.card.id === sourceId);

    if (!dataset) {
      return;
    }

    // Find the column index in the dataset that matches our reference
    const columnIndex = dataset.data.cols.findIndex(
      col => col.name === ref.originalName,
    );

    // If we found the column, extract its values
    if (columnIndex >= 0) {
      const values = dataset.data.rows.map(row => row[columnIndex]);
      referencedColumnValuesMap[ref.name] = values;
    }
  });

  // Handle special case for pivot grouping
  const hasPivotGrouping = columns.some(col => col.name === "pivot-grouping");
  if (hasPivotGrouping) {
    // Create an array of zeros with length matching the longest column
    const rowLengths = Object.values(referencedColumnValuesMap).map(
      values => values.length,
    );
    const maxLength = rowLengths.length > 0 ? Math.max(...rowLengths) : 0;
    referencedColumnValuesMap["pivot-grouping"] = new Array(maxLength).fill(0);
  }

  // Create rows by mapping and flattening values for each column
  const unzippedRows = columns.map(column =>
    (columnValuesMapping[column.name] ?? [])
      .map(valueSource => {
        if (isDataSourceNameRef(valueSource)) {
          const id = getDataSourceIdFromNameRef(valueSource);
          return `Not supported yet (card ${id})`;
        }
        const values = referencedColumnValuesMap[valueSource.name];
        if (!values) {
          return [];
        }
        return values;
      })
      .flat(),
  );

  const mergedData = {
    cols: columns,
    rows: _.zip(...unzippedRows),
    results_metadata: { columns },
  };

  const { display, settings } = dashcardSettings.visualization;

  return [
    {
      card: {
        display,
        visualization_settings: settings,
      },
      data: mergedData,
      started_at: new Date().toISOString(),
    },
  ];
}

export function RenderChart(rawSeries, dashcardSettings, dashcard, options) {
  const renderingContext = createStaticRenderingContext(
    options.applicationColors,
  );

  // TODO @tsp - more robust way of checking if this is a visualizer rendering
  if (
    "visualization" in dashcardSettings &&
    "columnValuesMapping" in dashcardSettings.visualization
  ) {
    rawSeries = getVisualizerRawSeries(rawSeries, dashcardSettings);
  }

  updateStartOfWeek(options.startOfWeek);
  MetabaseSettings.set("custom-formatting", options.customFormatting);

  const rawSeriesWithDashcardSettings = getRawSeriesWithDashcardSettings(
    rawSeries,
    dashcardSettings,
  );
  const rawSeriesWithRemappings = extractRemappings(
    rawSeriesWithDashcardSettings,
  );

  return ReactDOMServer.renderToStaticMarkup(
    <StaticVisualization
      rawSeries={rawSeriesWithRemappings}
      renderingContext={renderingContext}
    />,
  );
}

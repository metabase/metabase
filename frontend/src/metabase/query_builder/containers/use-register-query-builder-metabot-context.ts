import { useEffect, useRef } from "react";

import { useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import {
  getBase64ChartImage,
  getChartSelector,
} from "metabase/visualizations/lib/image-exports";

import {
  getIsLoadingComplete,
  getQuestion,
  getTransformedSeries,
  getTransformedTimelines,
  getVisualizationSettings,
} from "../selectors";
export const useRegisterQueryBuilderMetabotContext = () => {
  const question = useSelector(getQuestion);
  const isLoadingComplete = useSelector(getIsLoadingComplete);
  const chartImageRef = useRef<string | undefined>();

  // Capture chart image when loading is complete
  useEffect(() => {
    if (!question || !isLoadingComplete) {
      return;
    }

    // Small delay to ensure visualization has rendered
    const timeout = setTimeout(async () => {
      try {
        const imageBase64 = await getBase64ChartImage(
          getChartSelector({ cardId: question.id() }),
        );
        chartImageRef.current = imageBase64;
      } catch (error) {
        console.warn("Failed to capture chart image:", error);
        chartImageRef.current = undefined;
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [question, isLoadingComplete]);

  useRegisterMetabotContextProvider((state) => {
    const question = getQuestion(state);
    if (!question) {
      return {};
    }

    // Get real data from Redux state
    const transformedSeriesData = getTransformedSeries(state);
    const settings = getVisualizationSettings(state);
    const timelines = getTransformedTimelines(state);

    const baseContext = question.isSaved()
      ? {
          type: question.type(),
          id: question.id(),
          query: question.datasetQuery(),
        }
      : { type: "adhoc" as const, query: question.datasetQuery() };

    const mapBaseType = (baseType: string | undefined) => {
      // Map base types to one of Literal["number", "string", "date", "datetime", "time", "boolean"]
      if (!baseType) {
        return "string";
      }

      switch (baseType) {
        case "type/Boolean":
          return "boolean";
        case "type/Float":
        case "type/Integer":
        case "type/Decimal":
        case "type/BigInteger":
        case "type/Number":
          return "number";
        case "type/Date":
          return "date";
        case "type/DateTime":
        case "type/DateTimeWithTZ":
        case "type/DateTimeWithZoneID":
        case "type/Instant":
          return "datetime";
        case "type/Time":
        case "type/TimeWithTZ":
          return "time";
        case "type/Text":
        case "type/UUID":
        case "type/Dictionary":
        case "type/Array":
        case "type/*":
        default:
          return "string";
      }
    };

    // Extract series information from transformed series
    const extractSeriesInfo = () => {
      if (
        !transformedSeriesData ||
        transformedSeriesData.length === 0 ||
        !settings
      ) {
        return {};
      }

      const seriesInfo: Record<string, any> = {};

      transformedSeriesData.forEach((series, index) => {
        if (!series.data || !series.data.cols || !series.data.rows) {
          return;
        }

        const seriesKey = series.card.name || `series_${index}`;
        const cols = series.data.cols;
        const rows = series.data.rows; // Find dimension and metric columns
        const settingsObj = settings as any;
        const dimensionCol = cols.find(
          (col) =>
            settingsObj["graph.dimensions"] &&
            settingsObj["graph.dimensions"].includes(col.name),
        );
        const metricCol = cols.find(
          (col) =>
            settingsObj["graph.metrics"] &&
            settingsObj["graph.metrics"].includes(col.name),
        );

        if (dimensionCol && metricCol) {
          const dimensionIndex = cols.findIndex(
            (col) => col.name === dimensionCol.name,
          );
          const metricIndex = cols.findIndex(
            (col) => col.name === metricCol.name,
          );

          const xValues = rows
            .map((row) => row[dimensionIndex])
            .filter((val) => val != null);
          const yValues = rows
            .map((row) => row[metricIndex])
            .filter((val) => val != null);

          seriesInfo[seriesKey] = {
            x: {
              name: dimensionCol.name,
              type: mapBaseType(dimensionCol.base_type) || "string",
            },
            y: {
              name: metricCol.name,
              type: mapBaseType(metricCol.base_type) || "number",
            },
            x_values: xValues,
            y_values: yValues,
            display_name: series.card.name || seriesKey,
            chart_type: series.card.display || "line",
            stacked: settingsObj["stackable.stack_type"] === "stacked" || false,
          };
        }
      });

      return seriesInfo;
    };

    // Extract timeline events
    const extractTimelineEvents = () => {
      if (!timelines || timelines.length === 0) {
        return [];
      }

      const events: Array<{
        name: string;
        description: string;
        timestamp: Date;
      }> = [];

      timelines.forEach((timeline) => {
        if (timeline.events) {
          timeline.events.forEach((event) => {
            events.push({
              name: event.name,
              description: event.description || "",
              timestamp: new Date(event.timestamp),
            });
          });
        }
      });

      // Sort by timestamp (most recent first) and limit
      return events
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 20);
    };

    const seriesInfo = extractSeriesInfo();
    const timelineEvents = extractTimelineEvents();

    return {
      user_is_viewing: [
        {
          ...baseContext,
          chart_configs: [
            {
              image_base_64: chartImageRef.current,
              title: question.displayName(),
              description: question.description(),
              series: seriesInfo,
              timeline_events: timelineEvents,
            },
          ],
        },
      ],
    };
  }, []);
};

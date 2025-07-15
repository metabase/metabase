import { useMemo, useState } from "react";

import CS from "metabase/css/core/index.css";
import { isNotNull } from "metabase/lib/types";
import { ActionIcon, Box, Flex, Icon, Space, Tabs } from "metabase/ui";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type {
  RawSeries,
  TransformedSeries,
  VisualizationDisplay,
} from "metabase-types/api";

interface Widget {
  id: string;
  section: string;
  props: Record<string, unknown>;
}

interface SeriesSettingsProps {
  currentWidget: Widget;
  widgets: Widget[];
  display: VisualizationDisplay;
  computedSettings: ComputedVisualizationSettings;
  transformedSeries: RawSeries | TransformedSeries | undefined;
  onCloseClick: () => void;
}

/**
 * This component is used in the visualizer sidebar to display
 * the series settings widget and the formatting widget.
 */
export const SeriesSettings = ({
  currentWidget,
  widgets,
  display,
  computedSettings,
  transformedSeries,
  onCloseClick,
}: SeriesSettingsProps) => {
  const label = useMemo(() => {
    if (currentWidget?.props?.seriesKey !== undefined) {
      return "" + currentWidget.props.seriesKey;
    } else if (currentWidget?.props?.initialKey) {
      const singleSeriesForColumn = transformedSeries?.find((single) => {
        const metricColumn = single.data.cols[1];
        if (metricColumn) {
          return (
            getColumnKey(metricColumn) === currentWidget?.props?.initialKey
          );
        }
      });

      if (singleSeriesForColumn) {
        return singleSeriesForColumn.card.name;
      }
    }
  }, [currentWidget, transformedSeries]);

  const styleWidget = useMemo(() => {
    const seriesSettingsWidget =
      currentWidget &&
      widgets.find((widget) => widget.id === "series_settings");

    // In the pie the chart, clicking on the "measure" settings menu will only
    // open a formatting widget, and we don't want the style widget (used only
    // for dimension) to override that
    if (display === "pie" && currentWidget?.id === "column_settings") {
      return null;
    }

    // We don't want to show series settings widget for waterfall charts
    if (display === "waterfall" || !seriesSettingsWidget) {
      return null;
    }

    if (currentWidget.props?.seriesKey !== undefined) {
      return {
        ...seriesSettingsWidget,
        props: {
          ...seriesSettingsWidget.props,
          initialKey: currentWidget.props.seriesKey,
        },
      };
    } else if (currentWidget.props?.initialKey) {
      const hasBreakouts =
        computedSettings["graph.dimensions"] &&
        computedSettings["graph.dimensions"].length > 1;

      if (hasBreakouts) {
        return null;
      }

      const singleSeriesForColumn = transformedSeries?.find((single) => {
        const metricColumn = single.data.cols[1];
        if (metricColumn) {
          return (
            getColumnKey(metricColumn) === currentWidget?.props?.initialKey
          );
        }
      });

      if (singleSeriesForColumn) {
        return {
          ...seriesSettingsWidget,
          props: {
            ...seriesSettingsWidget.props,
            initialKey: keyForSingleSeries(singleSeriesForColumn),
          },
        };
      }
    }

    return null;
  }, [computedSettings, currentWidget, widgets, display, transformedSeries]);

  const formattingWidget = useMemo(() => {
    const widget =
      currentWidget && widgets.find((widget) => widget.id === currentWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...currentWidget.props } };
    }

    return null;
  }, [currentWidget, widgets]);

  const sections = useMemo(
    () =>
      Array.from(
        new Set<string>(
          [styleWidget, formattingWidget]
            .filter(isNotNull)
            .map((widget) => widget.section),
        ),
      ),
    [styleWidget, formattingWidget],
  );

  const [currentSection, setCurrentSection] = useState(sections[0]);

  const hasMultipleSections = sections.length > 1;

  return (
    <Box pt={hasMultipleSections ? 0 : undefined} className={CS.overflowYAuto}>
      <Flex direction="row" align="center" pt="md" pl="md" pr="md" gap="xs">
        <ActionIcon onClick={onCloseClick}>
          <Icon name="chevronleft" />
        </ActionIcon>
        <Space w="xs" />
        <span className={CS.textBold}>{label || "Series Settings"}</span>
      </Flex>
      {hasMultipleSections && (
        <Tabs
          pt="xs"
          value={currentSection}
          onChange={(section) => setCurrentSection(String(section))}
        >
          <Tabs.List grow>
            {sections.map((sectionName) => (
              <Tabs.Tab key={sectionName} value={sectionName} p="md">
                {sectionName}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}
      <Space py="sm"></Space>
      {[styleWidget, formattingWidget]
        .filter(isNotNull)
        .filter((widget) => widget.section === currentSection)
        ?.map((widget) => (
          <ChartSettingsWidget key={widget.id} {...widget} hidden={false} />
        ))}
    </Box>
  );
};

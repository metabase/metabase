import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Radio from "metabase/core/components/Radio";
import CS from "metabase/css/core/index.css";
import { updateSeriesColor } from "metabase/visualizations/lib/series";
import {
  getComputedSettings,
  getSettingsWidgets,
} from "metabase/visualizations/lib/settings";
import { getSettingDefinitionsForColumn } from "metabase/visualizations/lib/settings/column";
import { keyForSingleSeries } from "metabase/visualizations/lib/settings/series";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { DatasetColumn } from "metabase-types/api";

import ChartSettingsWidgetList from "../../ChartSettingsWidgetList";
import ChartSettingsWidgetPopover from "../../ChartSettingsWidgetPopover";
import type { Widget } from "../types";

import {
  ChartSettingsListContainer,
  ChartSettingsMenu,
  SectionContainer,
} from "./BaseChartSettings.styled";
import type { BaseChartSettingsProps } from "./types";

// section names are localized
const DEFAULT_TAB_PRIORITY = [t`Data`];

export const BaseChartSettings = ({
  initial,
  series,
  computedSettings = {},
  onChange,
  question,
  widgets,
  chartSettings,
  transformedSeries,
}: BaseChartSettingsProps) => {
  const [currentSection, setCurrentSection] = useState<string | null>(
    initial?.section ?? null,
  );
  const [currentWidget, setCurrentWidget] = useState<Widget | null>(
    initial?.widget ?? null,
  );
  const [popoverRef, setPopoverRef] = useState<HTMLElement | null>();

  const columnHasSettings = useCallback(
    (col: DatasetColumn) => {
      const settings = chartSettings || {};
      const settingsDefs = getSettingDefinitionsForColumn(series, col);
      const getComputedSettingsResult = getComputedSettings(
        settingsDefs,
        col,
        settings,
      );

      return getSettingsWidgets(
        settingsDefs,
        settings,
        getComputedSettingsResult,
        col,
        _.noop,
        {
          series: series,
        },
      ).some(widget => !widget.hidden);
    },
    [chartSettings, series],
  );

  const styleWidget = useMemo(() => {
    const seriesSettingsWidget =
      currentWidget && widgets.find(widget => widget.id === "series_settings");

    const display = transformedSeries?.[0]?.card?.display;
    // In the pie the chart, clicking on the "measure" settings menu will only
    // open a formatting widget, and we don't want the style widget (used only
    // for dimension) to override that
    if (display === "pie" && currentWidget?.id === "column_settings") {
      return null;
    }

    //We don't want to show series settings widget for waterfall charts
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

      const singleSeriesForColumn = transformedSeries?.find(single => {
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
  }, [computedSettings, currentWidget, transformedSeries, widgets]);

  const formattingWidget = useMemo(() => {
    const widget =
      currentWidget && widgets.find(widget => widget.id === currentWidget.id);

    if (widget) {
      return { ...widget, props: { ...widget.props, ...currentWidget.props } };
    }

    return null;
  }, [currentWidget, widgets]);

  const handleShowSection = useCallback((section: string) => {
    setCurrentSection(section);
    setCurrentWidget(null);
  }, []);

  // allows a widget to temporarily replace itself with a different widget
  const handleShowWidget = useCallback(
    (widget: Widget, ref: HTMLElement | null) => {
      setPopoverRef(ref);
      setCurrentWidget(widget);
    },
    [],
  );

  // go back to previously selected section
  const handleEndShowWidget = useCallback(() => {
    setPopoverRef(null);
    setCurrentWidget(null);
  }, []);

  const handleChangeSeriesColor = useCallback(
    (seriesKey: string, color: string) => {
      if (chartSettings) {
        onChange?.(updateSeriesColor(chartSettings, seriesKey, color));
      }
    },
    [chartSettings, onChange],
  );

  const sections: Record<string, Widget[]> = useMemo(() => {
    const sectionObj: Record<string, Widget[]> = {};
    for (const widget of widgets) {
      if (widget.widget && !widget.hidden) {
        sectionObj[widget.section] = sectionObj[widget.section] || [];
        sectionObj[widget.section].push(widget);
      }
    }

    // Move settings from the "undefined" section in the first tab
    if (sectionObj["undefined"] && Object.values(sectionObj).length > 1) {
      const extra = sectionObj["undefined"];
      delete sectionObj["undefined"];
      Object.values(sectionObj)[0].unshift(...extra);
    }
    return sectionObj;
  }, [widgets]);

  const sectionNames = Object.keys(sections);

  // This sorts the section radio buttons.
  const sectionSortOrder = [
    "data",
    "display",
    "axes",
    // include all section names so any forgotten sections are sorted to the end
    ...sectionNames.map(x => x.toLowerCase()),
  ];
  sectionNames.sort((a, b) => {
    const [aIdx, bIdx] = [a, b].map(x =>
      sectionSortOrder.indexOf(x.toLowerCase()),
    );
    return aIdx - bIdx;
  });

  const chartSettingCurrentSection = useMemo(
    () =>
      currentSection && sections[currentSection]
        ? currentSection
        : _.find(DEFAULT_TAB_PRIORITY, name => name in sections) ||
          sectionNames[0],
    [currentSection, sectionNames, sections],
  );

  const visibleWidgets = sections[chartSettingCurrentSection] || [];

  const currentSectionHasColumnSettings = (
    sections[chartSettingCurrentSection] || []
  ).some((widget: Widget) => widget.id === "column_settings");

  const extraWidgetProps = {
    // NOTE: special props to support adding additional fields
    question,
    onShowWidget: handleShowWidget,
    onEndShowWidget: handleEndShowWidget,
    currentSectionHasColumnSettings,
    columnHasSettings,
    onChangeSeriesColor: handleChangeSeriesColor,
  };

  const showSectionPicker =
    // don't show section tabs for a single section
    sectionNames.length > 1 &&
    // hide the section picker if the only widget is column_settings
    !(
      visibleWidgets.length === 1 &&
      visibleWidgets[0].id === "column_settings" &&
      // and this section doesn't have that as a direct child
      !currentSectionHasColumnSettings
    );

  return (
    <>
      <ChartSettingsMenu data-testid="chartsettings-sidebar">
        {showSectionPicker && (
          <SectionContainer isDashboard={false}>
            <Radio
              value={chartSettingCurrentSection ?? undefined}
              onChange={handleShowSection}
              options={sectionNames}
              optionNameFn={v => v}
              optionValueFn={v => v}
              optionKeyFn={v => v}
              variant="underlined"
            />
          </SectionContainer>
        )}
        <ChartSettingsListContainer className={CS.scrollShow}>
          <ChartSettingsWidgetList
            widgets={visibleWidgets}
            extraWidgetProps={extraWidgetProps}
          />
        </ChartSettingsListContainer>
      </ChartSettingsMenu>
      <ChartSettingsWidgetPopover
        anchor={popoverRef as HTMLElement}
        widgets={[styleWidget, formattingWidget].filter(
          (widget): widget is Widget => !!widget,
        )}
        handleEndShowWidget={handleEndShowWidget}
      />
    </>
  );
};

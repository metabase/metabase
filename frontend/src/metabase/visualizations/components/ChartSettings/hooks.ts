import { assocIn } from "icepick";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import type {
  UseChartSectionsProps,
  UseChartSettingsStateProps,
  Widget,
} from "metabase/visualizations/components/ChartSettings/types";
import { updateSettings } from "metabase/visualizations/lib/settings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

const DEFAULT_TAB_PRIORITY = [t`Data`];

export const useChartSettingsState = ({
  settings,
  series,
  onChange,
  widgets: propWidgets,
  isDashboard,
  dashboard,
}: UseChartSettingsStateProps) => {
  const chartSettings = useMemo(
    () => settings || series[0].card.visualization_settings,
    [series, settings],
  );

  const chartSettingsRawSeries = useMemo(
    () => assocIn(series, [0, "card", "visualization_settings"], chartSettings),
    [chartSettings, series],
  );

  const transformedSeries = useMemo(() => {
    const { series: transformedSeries } = getVisualizationTransformed(
      extractRemappings(chartSettingsRawSeries),
    );
    return transformedSeries;
  }, [chartSettingsRawSeries]);

  const handleChangeSettings = useCallback(
    (changedSettings: VisualizationSettings, question?: Question) => {
      onChange?.(updateSettings(chartSettings, changedSettings), question);
    },
    [chartSettings, onChange],
  );

  const widgets = useMemo(
    () =>
      propWidgets ||
      getSettingsWidgetsForSeries(
        transformedSeries,
        handleChangeSettings,
        isDashboard,
        { dashboardId: dashboard?.id },
      ),
    [
      propWidgets,
      transformedSeries,
      handleChangeSettings,
      isDashboard,
      dashboard?.id,
    ],
  );

  return {
    chartSettings,
    chartSettingsRawSeries,
    transformedSeries,
    handleChangeSettings,
    widgets,
  };
};
export const useChartSections = ({
  initial,
  widgets,
}: UseChartSectionsProps) => {
  const [currentSection, setCurrentSection] = useState<string | null>(
    initial?.section ?? null,
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

  const showSectionPicker =
    sectionNames.length > 1 &&
    !(
      visibleWidgets.length === 1 &&
      visibleWidgets[0].id === "column_settings" &&
      !currentSectionHasColumnSettings
    );

  return {
    sectionNames,
    chartSettingCurrentSection,
    visibleWidgets,
    showSectionPicker,
    currentSection,
    setCurrentSection,
    widgets,
  };
};

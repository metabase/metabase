import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import type { Widget } from "../types";

import type { BaseChartSettingsProps } from "./types";

// section names are localized
const DEFAULT_TAB_PRIORITY = [t`Data`];

export const useChartSettingsSections = ({
  initial,
  widgets,
}: Pick<BaseChartSettingsProps, "initial" | "widgets">) => {
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

  // This sorts the section radio buttons.
  const sectionNames = useMemo(() => {
    const names = Object.keys(sections);

    const sectionSortOrder = [
      "data",
      "display",
      "axes",
      // include all section names so any forgotten sections are sorted to the end
      ...names.map(x => x.toLowerCase()),
    ];
    names.sort((a, b) => {
      const [aIdx, bIdx] = [a, b].map(x =>
        sectionSortOrder.indexOf(x.toLowerCase()),
      );
      return aIdx - bIdx;
    });

    return names;
  }, [sections]);

  const chartSettingCurrentSection = useMemo(
    () =>
      currentSection && sections[currentSection]
        ? currentSection
        : _.find(DEFAULT_TAB_PRIORITY, name => name in sections) ||
          sectionNames[0],
    [currentSection, sectionNames, sections],
  );

  const visibleWidgets = useMemo(
    () => sections[chartSettingCurrentSection] || [],
    [chartSettingCurrentSection, sections],
  );

  const currentSectionHasColumnSettings = useMemo(
    () =>
      visibleWidgets.some((widget: Widget) => widget.id === "column_settings"),
    [visibleWidgets],
  );

  const showSectionPicker = useMemo(
    () =>
      // don't show section tabs for a single section
      sectionNames.length > 1 &&
      // hide the section picker if the only widget is column_settings
      !(
        visibleWidgets.length === 1 &&
        visibleWidgets[0].id === "column_settings" &&
        // and this section doesn't have that as a direct child
        !currentSectionHasColumnSettings
      ),
    [currentSectionHasColumnSettings, sectionNames.length, visibleWidgets],
  );

  return {
    sectionNames,
    setCurrentSection,
    currentSectionHasColumnSettings,
    chartSettingCurrentSection,
    showSectionPicker,
    visibleWidgets,
  };
};

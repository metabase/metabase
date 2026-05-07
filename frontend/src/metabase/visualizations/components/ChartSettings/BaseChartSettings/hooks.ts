import { useMemo, useState } from "react";
import { t } from "ttag";

import type { Widget } from "metabase/visualizations/types";

import type { BaseChartSettingsProps } from "./types";

const SECTION_SORT_PRIORITY = [
  "data",
  "columns",
  "display",
  "axes",
  "ranges",
  "formatting",
];

const sortSectionNames = (names: string[]): string[] => {
  // unknown sections fall through to insertion order at the end
  const sortOrder = [
    ...SECTION_SORT_PRIORITY,
    ...names.map((x) => x.toLowerCase()),
  ];
  return [...names].sort((a, b) => {
    const [aIdx, bIdx] = [a, b].map((x) => sortOrder.indexOf(x.toLowerCase()));
    return aIdx - bIdx;
  });
};

export const useChartSettingsSections = ({
  initial,
  widgets,
}: Pick<BaseChartSettingsProps, "initial" | "widgets">) => {
  const [currentSection, setCurrentSection] = useState<string | null>(
    initial?.section ?? null,
  );

  const { sections, sortedSectionNames } = useMemo(() => {
    // group visible widgets by section name
    const sectionObj: Record<string, Widget[]> = {};
    for (const widget of widgets) {
      if (widget.widget && !widget.hidden) {
        const key = String(widget.section);
        (sectionObj[key] ??= []).push(widget);
      }
    }

    // pull out unsectioned widgets if there is somewhere else to put them
    let extra: Widget[] | undefined;
    if (sectionObj["undefined"] && Object.keys(sectionObj).length > 1) {
      extra = sectionObj["undefined"];
      delete sectionObj["undefined"];
    }

    const sortedSectionNames = sortSectionNames(Object.keys(sectionObj));

    // prepend the extras to the first sorted section (not first inserted)
    if (extra) {
      sectionObj[sortedSectionNames[0]].unshift(...extra);
    }

    return { sections: sectionObj, sortedSectionNames };
  }, [widgets]);

  const chartSettingCurrentSection = useMemo(() => {
    if (currentSection && sections[currentSection]) {
      return currentSection;
    }
    const defaultSection = t`Data`;
    return defaultSection in sections ? defaultSection : sortedSectionNames[0];
  }, [currentSection, sortedSectionNames, sections]);

  const visibleWidgets = useMemo(
    () => sections[chartSettingCurrentSection] || [],
    [chartSettingCurrentSection, sections],
  );

  const currentSectionHasColumnSettings = visibleWidgets.some(
    (widget: Widget) => widget.id === "column_settings",
  );

  const showSectionPicker =
    sortedSectionNames.length > 1 &&
    !(
      visibleWidgets.length === 1 &&
      visibleWidgets[0].id === "column_settings" &&
      !currentSectionHasColumnSettings
    );

  return {
    sortedSectionNames,
    setCurrentSection,
    currentSectionHasColumnSettings,
    chartSettingCurrentSection,
    showSectionPicker,
    visibleWidgets,
  };
};

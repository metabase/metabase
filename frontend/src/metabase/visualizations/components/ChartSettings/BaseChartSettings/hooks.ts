import { useMemo, useState } from "react";
import { t } from "ttag";

import type { Widget } from "metabase/viz-core";

import type { BaseChartSettingsProps } from "./types";

// Section labels in priority order. Evaluated at call time so the order works
// in any locale — widgets store their `section` as a localized t`` string,
// which we compare against this same set of t`` calls.
const getSectionPriority = (): string[] => [
  t`Data`,
  t`Columns`,
  t`Display`,
  t`Axes`,
  t`Ranges`,
  t`Formatting`,
];

const orderSectionNames = (names: string[]): string[] => {
  const priority = getSectionPriority();
  const knownSections: (string | undefined)[] = new Array(priority.length);
  const unrecognizedSections: string[] = [];
  for (const name of names) {
    const idx = priority.indexOf(name);
    if (idx >= 0) {
      knownSections[idx] = name;
    } else {
      unrecognizedSections.push(name);
    }
  }
  // known sections fill their priority slot; the rest keep insertion order
  return [
    ...knownSections.filter((n): n is string => n !== undefined),
    ...unrecognizedSections,
  ];
};

const groupWidgetsBySection = (widgets: Widget[]): Record<string, Widget[]> => {
  const sectionObj: Record<string, Widget[]> = {};
  for (const widget of widgets) {
    if (widget.widget && !widget.hidden) {
      const key = String(widget.section);
      (sectionObj[key] ??= []).push(widget);
    }
  }
  return sectionObj;
};

// Remove unsectioned widgets so the caller can place them elsewhere, but
// only if there is somewhere else to put them. Mutates `sectionObj`.
const extractUnsectionedWidgets = (
  sectionObj: Record<string, Widget[]>,
): Widget[] | undefined => {
  if (!sectionObj["undefined"] || Object.keys(sectionObj).length <= 1) {
    return undefined;
  }
  const extras = sectionObj["undefined"];
  delete sectionObj["undefined"];
  return extras;
};

const isJoiningSection = (sectionWidgets: Widget[]) =>
  sectionWidgets.every((widget) => widget.joinsExistingSection);

// Move sections holding only `joinsExistingSection` widgets to the end of the
// first section by priority, so they never get a tab of their own. Mutates
// `sectionObj`.
const foldJoiningSections = (sectionObj: Record<string, Widget[]>) => {
  const sectionNames = orderSectionNames(Object.keys(sectionObj));
  const targetName = sectionNames.find(
    (name) => !isJoiningSection(sectionObj[name]),
  );
  if (targetName == null) {
    return;
  }
  for (const name of sectionNames) {
    if (isJoiningSection(sectionObj[name])) {
      sectionObj[targetName].push(...sectionObj[name]);
      delete sectionObj[name];
    }
  }
};

export const useChartSettingsSections = ({
  initial,
  widgets,
}: Pick<BaseChartSettingsProps, "initial" | "widgets">) => {
  const [currentSection, setCurrentSection] = useState<string | null>(
    initial?.section ?? null,
  );

  const { orderedSectionNames, chartSettingCurrentSection, visibleWidgets } =
    useMemo(() => {
      const sectionObj = groupWidgetsBySection(widgets);
      const extras = extractUnsectionedWidgets(sectionObj);
      foldJoiningSections(sectionObj);
      const orderedSectionNames = orderSectionNames(Object.keys(sectionObj));

      // place extras at the top of the first section by priority
      if (extras && orderedSectionNames.length > 0) {
        sectionObj[orderedSectionNames[0]].unshift(...extras);
      }

      // Data is first in the priority order, so orderedSectionNames[0] is the natural default
      const chartSettingCurrentSection =
        currentSection && sectionObj[currentSection]
          ? currentSection
          : orderedSectionNames[0];

      return {
        orderedSectionNames,
        chartSettingCurrentSection,
        visibleWidgets: sectionObj[chartSettingCurrentSection] || [],
      };
    }, [widgets, currentSection]);

  const currentSectionHasColumnSettings = visibleWidgets.some(
    (widget: Widget) => widget.id === "column_settings",
  );

  const showSectionPicker =
    // don't show section tabs for a single section
    orderedSectionNames.length > 1 &&
    // hide the section picker if the only widget is column_settings
    !(
      visibleWidgets.length === 1 &&
      visibleWidgets[0].id === "column_settings" &&
      // and this section doesn't have that as a direct child
      !currentSectionHasColumnSettings
    );

  return {
    orderedSectionNames,
    setCurrentSection,
    currentSectionHasColumnSettings,
    chartSettingCurrentSection,
    showSectionPicker,
    visibleWidgets,
  };
};

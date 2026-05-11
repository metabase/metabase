import { useMemo, useState } from "react";
import { t } from "ttag";

import type { Widget } from "metabase/visualizations/types";

import type { BaseChartSettingsProps } from "./types";

// Stable IDs for the sections we render in a fixed order. Widgets still
// declare `section` as a (localized) label string, so for sections actually
// used in production we map the label back to its ID when matching. This
// keeps the order working in any locale.
const SectionId = {
  Data: "data",
  Columns: "columns",
  Display: "display",
  Axes: "axes",
  Ranges: "ranges",
  Formatting: "formatting",
} as const;
type SectionId = (typeof SectionId)[keyof typeof SectionId];

const SECTION_PRIORITY: SectionId[] = [
  SectionId.Data,
  SectionId.Columns,
  SectionId.Display,
  SectionId.Axes,
  SectionId.Ranges,
  SectionId.Formatting,
];

// localized labels for sections actually used in production. Sections in
// SECTION_PRIORITY without a label here are English-ID-only.
const getSectionLabel = (id: SectionId): string | undefined => {
  switch (id) {
    case SectionId.Data:
      return t`Data`;
    case SectionId.Display:
      return t`Display`;
    case SectionId.Formatting:
      return t`Formatting`;
    case SectionId.Columns:
    case SectionId.Axes:
    case SectionId.Ranges:
      return undefined;
  }
};

const orderSectionNames = (names: string[]): string[] => {
  // precompute lowercase labels once so the inner loop is just string compares
  const labelById = new Map<SectionId, string>();
  for (const id of SECTION_PRIORITY) {
    const label = getSectionLabel(id);
    if (label) {
      labelById.set(id, label.toLowerCase());
    }
  }
  const matchesSectionId = (name: string, id: SectionId): boolean => {
    const lower = name.toLowerCase();
    return lower === id || lower === labelById.get(id);
  };

  const ordered: string[] = [];
  const remaining = new Set(names);
  // emit known sections in priority order
  for (const id of SECTION_PRIORITY) {
    const match = names.find((name) => matchesSectionId(name, id));
    if (match) {
      ordered.push(match);
      remaining.delete(match);
    }
  }
  // append unknown sections in their original (insertion) order
  for (const name of names) {
    if (remaining.has(name)) {
      ordered.push(name);
    }
  }
  return ordered;
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
      const orderedSectionNames = orderSectionNames(Object.keys(sectionObj));

      // place extras at the top of the first section by priority
      if (extras && orderedSectionNames.length > 0) {
        sectionObj[orderedSectionNames[0]].unshift(...extras);
      }

      // Data is first in SECTION_PRIORITY, so orderedSectionNames[0] is the natural default
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

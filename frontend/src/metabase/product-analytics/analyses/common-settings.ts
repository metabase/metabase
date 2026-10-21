import { t } from "ttag";

import type { ColumnRole, ColumnRoles } from "../columns";
import { AddFilterButton } from "../components/AddFilterButton";
import { ColumnPickerWidget } from "../components/settings/ColumnPickerWidget";
import { EventDefinitionWidget } from "../components/settings/EventDefinitionWidget";
import { BreakoutMenu } from "../components/toolbar/BreakoutMenu";
import { CountingMenu } from "../components/toolbar/CountingMenu";
import { DateRangeButton } from "../components/toolbar/DateRangeButton";
import { GranularityButton } from "../components/toolbar/GranularityButton";
import { DEFAULT_DATE_RANGE, parseDateRange } from "../date-range";
import { NO_FILTERS, isAnalysisFilters } from "../filters";
import type { SettingDefinition } from "../settings/types";
import { withWidgetProps } from "../settings/with-widget-props";
import type { Grain, Granularity } from "../spec/types";

import {
  getColumnOptions,
  getDefaultColumn,
  getUserPropertyOptions,
  isColumnInTable,
  isUserPropertyColumn,
} from "./column-roles";
import { isOneOf, isOptionalEventDefinition } from "./setting-helpers";
import type {
  AnalysisContext,
  AnalysisSettingDefinitions,
  ColumnRoleSettings,
  CommonSettings,
} from "./types";

const GRAINS: readonly Grain[] = ["person", "session", "event"];

type ColumnRoleKey = `columns.${ColumnRole}`;

export const getColumnRoles = (settings: ColumnRoleSettings): ColumnRoles => ({
  timestamp: settings["columns.timestamp"],
  person: settings["columns.person"],
  session: settings["columns.session"],
  event_id: settings["columns.event_id"],
  event_name: settings["columns.event_name"],
  url_path: settings["columns.url_path"],
});

const columnRoleSetting = (
  role: ColumnRole,
  getTitle: () => string,
  isRequired: boolean,
): SettingDefinition<AnalysisContext, CommonSettings, ColumnRoleKey> => ({
  getTitle,
  group: "columns",
  getSection: () => "advanced",
  widget: ColumnPickerWidget,
  getDefault: (context) => getDefaultColumn(context.table, role),
  isValid: (value, context) => isColumnInTable(context.table, value),
  getProps: (context) => ({
    columns: getColumnOptions(context.table),
    isRequired,
  }),
});

const COLUMN_FOR_GRAIN: Record<Grain, ColumnRoleKey> = {
  person: "columns.person",
  session: "columns.session",
  event: "columns.event_id",
};

const isCountable = (
  grain: Grain,
  settings: Partial<ColumnRoleSettings>,
): boolean => typeof settings[COLUMN_FOR_GRAIN[grain]] === "string";

type GranularityOptions = {
  units: Granularity[];
  defaultUnit: Granularity;
};

const granularitySetting = (
  options: GranularityOptions | null,
): SettingDefinition<AnalysisContext, CommonSettings, "granularity"> => ({
  getSection: () => "toolbar",
  widget: GranularityButton,
  getDefault: () => options?.defaultUnit ?? "week",
  isValid: (value) => options !== null && isOneOf(options.units, value),
  getHidden: () => options === null,
  getProps: () => ({ units: options?.units ?? [] }),
});

const breakoutSetting = (
  isEnabled: boolean,
): SettingDefinition<AnalysisContext, CommonSettings, "breakout"> =>
  withWidgetProps({
    getSection: () => "toolbar",
    widget: BreakoutMenu,
    getDefault: () => null,
    isValid: (value, context) =>
      value === null || (isEnabled && isUserPropertyColumn(context, value)),
    getHidden: () => !isEnabled,
    getProps: (context, settings) => ({
      columns: getUserPropertyOptions(context, getColumnRoles(settings)),
    }),
  });

/**
 * Settings every analysis has: the toolbar controls and the column roles.
 * Pass `granularity: null` for analyses without a time grain, and
 * `breakout: true` for analyses that can split their result by a property.
 */
export const commonSettings = ({
  granularity,
  breakout = false,
}: {
  granularity: GranularityOptions | null;
  breakout?: boolean;
}): AnalysisSettingDefinitions<CommonSettings> => ({
  date_range: {
    getSection: () => "toolbar",
    widget: DateRangeButton,
    getDefault: () => DEFAULT_DATE_RANGE,
    isValid: (value) =>
      typeof value === "string" && parseDateRange(value) !== undefined,
  },
  counting: {
    getSection: () => "toolbar",
    widget: CountingMenu,
    getDefault: () => "person",
    isValid: (value, _context, settings) =>
      isOneOf(GRAINS, value) && isCountable(value, settings),
    getProps: (_context, settings) => ({
      options: GRAINS.filter((grain) => isCountable(grain, settings)),
    }),
    readDependencies: ["columns.person", "columns.session", "columns.event_id"],
  },
  granularity: granularitySetting(granularity),
  breakout: breakoutSetting(breakout),
  filters: withWidgetProps({
    getSection: () => "toolbar",
    widget: AddFilterButton,
    getDefault: () => NO_FILTERS,
    isValid: (value) => isAnalysisFilters(value),
    getProps: (context) => ({ table: context.table }),
  }),
  "columns.timestamp": columnRoleSetting(
    "timestamp",
    () => t`Event time`,
    true,
  ),
  "columns.person": columnRoleSetting("person", () => t`Person`, true),
  "columns.session": columnRoleSetting("session", () => t`Session`, false),
  "columns.event_id": columnRoleSetting("event_id", () => t`Event ID`, false),
  "columns.event_name": columnRoleSetting(
    "event_name",
    () => t`Event name`,
    false,
  ),
  "columns.url_path": columnRoleSetting("url_path", () => t`URL path`, false),
  pageviews: withWidgetProps({
    getTitle: () => t`Pageviews`,
    getHint: () =>
      t`Paths show each pageview as its URL path, rather than as one event.`,
    group: "columns",
    getSection: () => "advanced",
    widget: EventDefinitionWidget,
    getDefault: (context) => context.detectedPageviews ?? null,
    isValid: (value) => isOptionalEventDefinition(value),
    getProps: (context) => ({ table: context.table, emptyLabel: t`None` }),
  }),
});

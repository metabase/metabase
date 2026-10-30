import { t } from "ttag";

import {
  type ColumnRoleKey,
  type ColumnRoles,
  EVENT_TABLE_SETTINGS,
  type EventTableSettings,
  type SettingDefinition,
  getEventTableSettings,
  isColumnInTable,
  withWidgetProps,
} from "metabase/event-tables";
import { SegmentedControl } from "metabase/ui";

import { AddFilterButton } from "../components/AddFilterButton";
import { BreakoutMenu } from "../components/toolbar/BreakoutMenu";
import { CountingMenu } from "../components/toolbar/CountingMenu";
import { DateRangeButton } from "../components/toolbar/DateRangeButton";
import { GranularityButton } from "../components/toolbar/GranularityButton";
import { DEFAULT_DATE_RANGE, parseDateRange } from "../date-range";
import { NO_FILTERS, isAnalysisFilters } from "../filters";
import type { ActorGrain, Grain, Granularity } from "../spec/types";

import { BREAKOUT_VIEWS, isBreakout } from "./breakout";
import { getUserPropertyOptions, isUserPropertyColumn } from "./column-roles";
import { isOneOf } from "./setting-helpers";
import type {
  AnalysisContext,
  AnalysisSettingDefinitions,
  CommonSettings,
} from "./types";

export const getColumnRoles = (settings: EventTableSettings): ColumnRoles => ({
  timestamp: settings["columns.timestamp"],
  person: settings["columns.person"],
  session: settings["columns.session"],
  event_name: settings["columns.event_name"],
  url_path: settings["columns.url_path"],
});

/**
 * The table's value for a setting. When the analysis overrides a setting it
 * depends on, and it no longer fits, the setting's own default.
 */
const getTableDefault = <K extends keyof EventTableSettings>(
  key: K,
  context: AnalysisContext,
  settings: Partial<CommonSettings>,
): EventTableSettings[K] => {
  const definition = EVENT_TABLE_SETTINGS[key];
  const tableValue = getEventTableSettings(context.table)[key];
  return definition.isValid(tableValue, context, settings)
    ? tableValue
    : definition.getDefault(context, settings);
};

/**
 * A table setting, defaulting to the table's value: an analysis only keeps
 * what it overrides, so it follows later changes to the table.
 */
const columnRoleSetting = (
  key: ColumnRoleKey,
): SettingDefinition<AnalysisContext, CommonSettings, ColumnRoleKey> => ({
  ...EVENT_TABLE_SETTINGS[key],
  getDefault: (context, settings) => getTableDefault(key, context, settings),
});

const pageviewsSetting: SettingDefinition<
  AnalysisContext,
  CommonSettings,
  "pageviews"
> = {
  ...EVENT_TABLE_SETTINGS.pageviews,
  getDefault: (context, settings) =>
    getTableDefault("pageviews", context, settings),
};

const pathCleaningSetting: SettingDefinition<
  AnalysisContext,
  CommonSettings,
  "path_cleaning"
> = {
  ...EVENT_TABLE_SETTINGS.path_cleaning,
  // Without a URL path, the table has no rules because it has nothing to
  // clean, not because someone chose none, so a URL path picked here gets
  // the default rules.
  getDefault: (context, settings) =>
    getEventTableSettings(context.table)["columns.url_path"] !== null
      ? getTableDefault("path_cleaning", context, settings)
      : EVENT_TABLE_SETTINGS.path_cleaning.getDefault(context, settings),
};

const COLUMN_FOR_GRAIN: Record<ActorGrain, ColumnRoleKey> = {
  person: "columns.person",
  session: "columns.session",
};

/** Every row is an event, so events are always countable. */
const isCountable = (
  grain: Grain,
  settings: Partial<EventTableSettings>,
): boolean =>
  grain === "event" || typeof settings[COLUMN_FOR_GRAIN[grain]] === "string";

export const hasSessionColumn = (
  settings: Partial<EventTableSettings>,
): boolean => isCountable("session", settings);

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
      value === null || (isEnabled && isBreakoutValid(context, value)),
    getHidden: () => !isEnabled,
    getProps: (context, settings) => ({
      columns: getUserPropertyOptions(context, getColumnRoles(settings)),
      usersTable: context.usersTable?.table,
    }),
  });

/**
 * Any of the users table's fields, as its picker offers them all, or else
 * an event table property. People segments live on the users table, so
 * cohorts need one linked.
 */
const isBreakoutValid = (context: AnalysisContext, value: unknown) =>
  isBreakout(value) &&
  (value.type === "property"
    ? context.usersTable !== undefined
      ? isColumnInTable(context.usersTable.table, value.column)
      : isUserPropertyColumn(context, value.column)
    : context.usersTable !== undefined);

/**
 * Settings every analysis has: the toolbar controls and the column roles.
 * Pass `granularity: null` for analyses without a time grain, and
 * `breakout: true` for analyses that can split their result by a property.
 */
export const commonSettings = ({
  granularity,
  breakout = false,
  canPivot = false,
  grains,
}: {
  granularity: GranularityOptions | null;
  breakout?: boolean;
  /** Whether a breakout can show as a pivot table, as well as a chart. */
  canPivot?: boolean;
  /** What the analysis can count, the default first when it has a column. */
  grains: readonly Grain[];
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
    // The person column is required, so people are always countable.
    getDefault: (_context, settings) =>
      grains.find((grain) => isCountable(grain, settings)) ?? "person",
    isValid: (value, _context, settings) =>
      isOneOf(grains, value) && isCountable(value, settings),
    getProps: (context, settings) => ({
      options: grains.filter((grain) => isCountable(grain, settings)),
      isDisabled: context.table === undefined,
    }),
    readDependencies: ["columns.person", "columns.session"],
  },
  granularity: granularitySetting(granularity),
  breakout: breakoutSetting(breakout),
  breakout_view: withWidgetProps({
    getTitle: () => t`Show as`,
    getSection: () => "setup",
    widget: SegmentedControl,
    getDefault: () => "chart",
    isValid: (value) => isOneOf(BREAKOUT_VIEWS, value),
    getHidden: (_context, settings) => !canPivot || settings.breakout === null,
    getProps: () => ({
      data: [
        { label: t`Chart`, value: "chart" as const },
        { label: t`Pivot table`, value: "pivot" as const },
      ],
      w: "100%",
    }),
    readDependencies: ["breakout"],
  }),
  filters: withWidgetProps({
    getSection: () => "toolbar",
    widget: AddFilterButton,
    getDefault: () => NO_FILTERS,
    isValid: (value) => isAnalysisFilters(value),
    getProps: (context) => ({
      table: context.table,
      usersTable: context.usersTable,
    }),
  }),
  "columns.timestamp": columnRoleSetting("columns.timestamp"),
  "columns.person": columnRoleSetting("columns.person"),
  "columns.event_name": columnRoleSetting("columns.event_name"),
  "columns.session": columnRoleSetting("columns.session"),
  "columns.url_path": columnRoleSetting("columns.url_path"),
  pageviews: pageviewsSetting,
  path_cleaning: pathCleaningSetting,
});

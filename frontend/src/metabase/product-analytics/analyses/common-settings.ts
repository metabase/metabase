import { t } from "ttag";

import {
  type ColumnRoleKey,
  type ColumnRoles,
  type EventTableSettings,
  type SettingDefinition,
  type SettingSection,
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
 * A table setting, as the table has it. Tables' settings are only set in Data
 * Studio, so a value an analysis stored for one, from before they were, is
 * never valid.
 */
const tableSetting = <V>(read: (settings: EventTableSettings) => V) => ({
  getSection: (): SettingSection => "advanced",
  getDefault: ({ table }: AnalysisContext): V =>
    read(getEventTableSettings(table)),
  isValid: () => false,
});

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
 * Settings every analysis has: the toolbar controls and the table's settings.
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
  "columns.timestamp": tableSetting(
    (settings) => settings["columns.timestamp"],
  ),
  "columns.person": tableSetting((settings) => settings["columns.person"]),
  "columns.event_name": tableSetting(
    (settings) => settings["columns.event_name"],
  ),
  "columns.session": tableSetting((settings) => settings["columns.session"]),
  "columns.url_path": tableSetting((settings) => settings["columns.url_path"]),
  pageviews: tableSetting((settings) => settings.pageviews),
  path_cleaning: tableSetting((settings) => settings.path_cleaning),
});

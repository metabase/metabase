import { t } from "ttag";

import { getObjectEntries } from "metabase/utils/objects";
import type { Table } from "metabase-types/api";

import { ColumnPickerWidget } from "./ColumnPickerWidget";
import { PageviewsWidget } from "./PageviewsWidget";
import { PathCleaningWidget } from "./PathCleaningWidget";
import {
  type ColumnRole,
  REQUIRED_COLUMN_ROLES,
  getColumnOptions,
  getDateColumnOptions,
  isColumnInTable,
  isDateColumnInTable,
} from "./column-roles";
import { EVERY_EVENT, type PageviewRule, isPageviewRule } from "./pageviews";
import {
  type PathCleaningRule,
  getDefaultPathCleaningRules,
  isPathCleaningRuleList,
} from "./path-cleaning";
import { computeSettings } from "./settings/compute";
import type {
  SettingDefinition,
  SettingDefinitions,
  SettingGroup,
  SettingWidget,
} from "./settings/types";
import { withWidgetProps } from "./settings/with-widget-props";

/** Facts the event table settings are computed from. */
export type EventTableContext = {
  table: Table | undefined;
};

export type ColumnRoleKey = `columns.${ColumnRole}`;

export type EventTableSettings = Record<ColumnRoleKey, string | null> & {
  pageviews: PageviewRule | null;
  /** Applied to the URL path column before anything reads it. */
  path_cleaning: PathCleaningRule[];
};

export const isColumnRoleKey = (key: string): key is ColumnRoleKey =>
  key.startsWith("columns.");

type ColumnRoleOptions = {
  getTitle: () => string;
  group: SettingGroup;
  isDate?: boolean;
};

const columnRoleSetting = (
  key: ColumnRoleKey,
  { getTitle, group, isDate = false }: ColumnRoleOptions,
): SettingDefinition<EventTableContext, EventTableSettings, ColumnRoleKey> => {
  const isValidColumn = isDate ? isDateColumnInTable : isColumnInTable;
  const isRequired = group === "required_columns";
  return {
    getTitle,
    group,
    getSection: () => "advanced",
    widget: ColumnPickerWidget,
    // Sync's detection is the default, when the column it picked still fits.
    getDefault: ({ table }) => {
      const detected = table?.detected_event_settings?.settings[key];
      return typeof detected === "string" && isValidColumn(table, detected)
        ? detected
        : null;
    },
    isValid: (value, { table }) => isValidColumn(table, value),
    getProps: ({ table }) => ({
      columns: isDate ? getDateColumnOptions(table) : getColumnOptions(table),
      isRequired,
    }),
  };
};

/**
 * Pageviews are named by their URL path, so there are none without one. With
 * no event name to name the rest by, every event is one.
 */
const isPageviewsValid = (
  value: unknown,
  table: Table | undefined,
  settings: Partial<EventTableSettings>,
): value is PageviewRule | null => {
  if (settings["columns.url_path"] == null) {
    return value === null;
  }
  if (settings["columns.event_name"] == null) {
    return isPageviewRule(value, table) && value.type === "every_event";
  }
  return value === null || isPageviewRule(value, table);
};

const pageviewsSetting: SettingDefinition<
  EventTableContext,
  EventTableSettings,
  "pageviews"
> = withWidgetProps({
  getTitle: () => t`How do you define a pageview?`,
  group: "pages",
  getSection: () => "advanced",
  widget: PageviewsWidget,
  getDefault: ({ table }, settings) => {
    const detected = table?.detected_event_settings?.settings.pageviews;
    if (isPageviewsValid(detected, table, settings)) {
      return detected;
    }
    // None, unless there's no event name to name the rest by.
    return isPageviewsValid(null, table, settings) ? null : EVERY_EVENT;
  },
  isValid: (value, { table }, settings) =>
    isPageviewsValid(value, table, settings),
  getHidden: (_context, settings) =>
    settings["columns.url_path"] === null ||
    settings["columns.event_name"] === null,
  getProps: ({ table }, settings) => ({
    table,
    eventNameColumn: settings["columns.event_name"],
  }),
  readDependencies: ["columns.url_path", "columns.event_name"],
});

const pathCleaningSetting: SettingDefinition<
  EventTableContext,
  EventTableSettings,
  "path_cleaning"
> = {
  getTitle: () => t`Path cleaning`,
  getHint: () =>
    t`Each rule replaces every match of its regular expression in the URL path, in order.`,
  group: "pages",
  getSection: () => "advanced",
  widget: PathCleaningWidget,
  getDefault: (_context, settings) =>
    settings["columns.url_path"] != null ? getDefaultPathCleaningRules() : [],
  isValid: (value) => isPathCleaningRuleList(value),
  getHidden: (_context, settings) => settings["columns.url_path"] === null,
  readDependencies: ["columns.url_path"],
};

/**
 * Settings that belong to an event table rather than to one analysis. Data
 * Studio edits them on the table; analyses default to them and can override
 * them.
 */
export const EVENT_TABLE_SETTINGS: SettingDefinitions<
  EventTableContext,
  EventTableSettings
> = {
  "columns.timestamp": columnRoleSetting("columns.timestamp", {
    getTitle: () => t`Event time column`,
    group: "required_columns",
    isDate: true,
  }),
  "columns.person": columnRoleSetting("columns.person", {
    getTitle: () => t`Person column`,
    group: "required_columns",
  }),
  "columns.event_name": columnRoleSetting("columns.event_name", {
    getTitle: () => t`Event name column`,
    group: "optional_columns",
  }),
  "columns.session": columnRoleSetting("columns.session", {
    getTitle: () => t`Session column`,
    group: "optional_columns",
  }),
  "columns.url_path": columnRoleSetting("columns.url_path", {
    getTitle: () => t`URL path column`,
    group: "pages",
  }),
  pageviews: pageviewsSetting,
  path_cleaning: pathCleaningSetting,
};

type EventTableGroup = {
  getTitle: () => string;
  getDescription?: () => string;
};

/** In the order they're shown. */
const EVENT_TABLE_GROUPS: Record<SettingGroup, EventTableGroup> = {
  required_columns: { getTitle: () => t`Required` },
  optional_columns: { getTitle: () => t`Optional` },
  pages: {
    getTitle: () => t`Pageviews (optional)`,
    getDescription: () =>
      t`Manage how URL paths are displayed for pageview events.`,
  },
};

export type EventTableSection = {
  id: SettingGroup;
  title: string;
  description: string | undefined;
  widgets: SettingWidget[];
};

/**
 * The event table settings' widgets, in the sections both of their editors
 * show. Sections without a widget are left out.
 */
export const getEventTableSections = (
  widgets: readonly SettingWidget[],
): EventTableSection[] =>
  getObjectEntries(EVENT_TABLE_GROUPS)
    .map(([id, group]) => ({
      id,
      title: group.getTitle(),
      description: group.getDescription?.(),
      widgets: widgets.filter((widget) => widget.group === id),
    }))
    .filter((section) => section.widgets.length > 0);

/** The table's settings: what a user set, over what sync detected. */
export const getEventTableSettings = (
  table: Table | undefined,
): EventTableSettings =>
  computeSettings(EVENT_TABLE_SETTINGS, { table }, table?.event_settings ?? {});

/** The required roles no column plays yet. */
export const getMissingColumnRoles = (
  settings: Pick<EventTableSettings, ColumnRoleKey>,
): ColumnRole[] =>
  REQUIRED_COLUMN_ROLES.filter((role) => settings[`columns.${role}`] === null);

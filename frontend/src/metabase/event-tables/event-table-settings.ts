import type { ComponentProps } from "react";
import { t } from "ttag";

import { getObjectEntries } from "metabase/utils/objects";
import type { Table } from "metabase-types/api";

import { ColumnPickerWidget } from "./ColumnPickerWidget";
import { PageviewsWidget } from "./PageviewsWidget";
import { PathCleaningWidget } from "./PathCleaningWidget";
import { PersonColumnWidget } from "./PersonColumnWidget";
import {
  type ColumnRole,
  REQUIRED_COLUMN_ROLES,
  getColumnOptions,
  getDateColumnOptions,
  isColumnInTable,
  isDateColumnInTable,
} from "./column-roles";
import { isEventTable } from "./event-schemas";
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
  SettingWidget,
  SettingWidgetProps,
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

/** The sections Data Studio shows the settings in. */
type EventTableSectionId = "required_columns" | "optional_columns" | "pages";

type EventTableSettingDefinition<K extends keyof EventTableSettings> =
  SettingDefinition<
    EventTableContext,
    EventTableSettings,
    K,
    object,
    EventTableSectionId
  >;

type ColumnRoleOptions = {
  getTitle: () => string;
  section: EventTableSectionId;
  isDate?: boolean;
};

const columnRoleSetting = (
  key: ColumnRoleKey,
  { getTitle, section, isDate = false }: ColumnRoleOptions,
): EventTableSettingDefinition<ColumnRoleKey> => {
  const isValidColumn = isDate ? isDateColumnInTable : isColumnInTable;
  const isRequired = section === "required_columns";
  return {
    getTitle,
    getSection: () => section,
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

type PageviewsWidgetExtraProps = Omit<
  ComponentProps<typeof PageviewsWidget>,
  keyof SettingWidgetProps<PageviewRule | null>
>;

const pageviewsSetting: EventTableSettingDefinition<"pageviews"> =
  withWidgetProps<
    EventTableContext,
    EventTableSettings,
    "pageviews",
    PageviewsWidgetExtraProps,
    EventTableSectionId
  >({
    getTitle: () => t`How do you define a pageview?`,
    getSection: () => "pages",
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

const pathCleaningSetting: EventTableSettingDefinition<"path_cleaning"> = {
  getTitle: () => t`Path cleaning`,
  getHint: () =>
    t`Each rule replaces every match of its regular expression in the URL path, in order.`,
  getSection: () => "pages",
  widget: PathCleaningWidget,
  getDefault: (_context, settings) =>
    settings["columns.url_path"] != null ? getDefaultPathCleaningRules() : [],
  isValid: (value) => isPathCleaningRuleList(value),
  getHidden: (_context, settings) => settings["columns.url_path"] === null,
  readDependencies: ["columns.url_path"],
};

/**
 * Settings that belong to an event table rather than to one analysis. Data
 * Studio edits them; analyses read them.
 */
export const EVENT_TABLE_SETTINGS: SettingDefinitions<
  EventTableContext,
  EventTableSettings,
  EventTableSectionId
> = {
  "columns.timestamp": columnRoleSetting("columns.timestamp", {
    getTitle: () => t`Event time column`,
    section: "required_columns",
    isDate: true,
  }),
  "columns.person": {
    ...columnRoleSetting("columns.person", {
      getTitle: () => t`Person column`,
      section: "required_columns",
    }),
    widget: PersonColumnWidget,
    getProps: ({ table }) => ({
      columns: getColumnOptions(table),
      isRequired: true,
      table,
    }),
  },
  "columns.event_name": columnRoleSetting("columns.event_name", {
    getTitle: () => t`Event name column`,
    section: "optional_columns",
  }),
  "columns.session": columnRoleSetting("columns.session", {
    getTitle: () => t`Session column`,
    section: "optional_columns",
  }),
  "columns.url_path": columnRoleSetting("columns.url_path", {
    getTitle: () => t`URL path column`,
    section: "pages",
  }),
  pageviews: pageviewsSetting,
  path_cleaning: pathCleaningSetting,
};

type EventTableSectionTitles = {
  getTitle: () => string;
  getDescription?: () => string;
};

/** In the order they're shown. */
const EVENT_TABLE_SECTIONS: Record<
  EventTableSectionId,
  EventTableSectionTitles
> = {
  required_columns: { getTitle: () => t`Required` },
  optional_columns: { getTitle: () => t`Optional` },
  pages: {
    getTitle: () => t`Pageviews (optional)`,
    getDescription: () =>
      t`Manage how URL paths are displayed for pageview events.`,
  },
};

export type EventTableSettingWidget = SettingWidget<EventTableSectionId>;

export type EventTableSection = {
  id: EventTableSectionId;
  title: string;
  description: string | undefined;
  widgets: EventTableSettingWidget[];
};

/**
 * The event table settings' widgets in Data Studio's sections. Sections
 * without a widget are left out.
 */
export const getEventTableSections = (
  widgets: readonly EventTableSettingWidget[],
): EventTableSection[] =>
  getObjectEntries(EVENT_TABLE_SECTIONS)
    .map(([id, section]) => ({
      id,
      title: section.getTitle(),
      description: section.getDescription?.(),
      widgets: widgets.filter((widget) => widget.section === id),
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

/**
 * Whether product analysis can use the table: it's an event table, and every
 * required role has a column. Without the table's fields, as in a table list,
 * the roles' columns are assumed to exist.
 */
export const isEventTableSetUp = (table: Table): boolean =>
  isEventTable(table) &&
  getMissingColumnRoles(getEventTableSettings(table)).length === 0;

import { t } from "ttag";

import type { Table } from "metabase-types/api";

import { ColumnPickerWidget } from "./ColumnPickerWidget";
import {
  type ColumnRole,
  REQUIRED_COLUMN_ROLES,
  getColumnOptions,
  getDateColumnOptions,
  isColumnInTable,
  isDateColumnInTable,
} from "./column-roles";
import { computeSettings } from "./settings/compute";
import type { SettingDefinition, SettingDefinitions } from "./settings/types";

/** Facts the event table settings are computed from. */
export type EventTableContext = {
  table: Table | undefined;
};

export type ColumnRoleKey = `columns.${ColumnRole}`;

export type EventTableSettings = Record<ColumnRoleKey, string | null>;

type ColumnRoleOptions = {
  getTitle: () => string;
  isRequired: boolean;
  isDate?: boolean;
};

const columnRoleSetting = (
  key: ColumnRoleKey,
  { getTitle, isRequired, isDate = false }: ColumnRoleOptions,
): SettingDefinition<EventTableContext, EventTableSettings, ColumnRoleKey> => {
  const isValidColumn = isDate ? isDateColumnInTable : isColumnInTable;
  return {
    getTitle,
    group: "columns",
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
 * Settings that belong to an event table rather than to one analysis. Data
 * Studio edits them on the table; analyses default to them and can override
 * them.
 */
export const EVENT_TABLE_SETTINGS: SettingDefinitions<
  EventTableContext,
  EventTableSettings
> = {
  "columns.timestamp": columnRoleSetting("columns.timestamp", {
    getTitle: () => t`Event time`,
    isRequired: true,
    isDate: true,
  }),
  "columns.person": columnRoleSetting("columns.person", {
    getTitle: () => t`Person`,
    isRequired: true,
  }),
  "columns.event_name": columnRoleSetting("columns.event_name", {
    getTitle: () => t`Event name (optional)`,
    isRequired: false,
  }),
  "columns.session": columnRoleSetting("columns.session", {
    getTitle: () => t`Session (optional)`,
    isRequired: false,
  }),
  "columns.url_path": columnRoleSetting("columns.url_path", {
    getTitle: () => t`URL path (optional)`,
    isRequired: false,
  }),
};

/** The table's settings: what a user set, over what sync detected. */
export const getEventTableSettings = (
  table: Table | undefined,
): EventTableSettings =>
  computeSettings(EVENT_TABLE_SETTINGS, { table }, table?.event_settings ?? {});

/** The required roles no column plays yet. */
export const getMissingColumnRoles = (
  settings: EventTableSettings,
): ColumnRole[] =>
  REQUIRED_COLUMN_ROLES.filter((role) => settings[`columns.${role}`] === null);

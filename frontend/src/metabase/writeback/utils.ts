import { TYPE } from "metabase/lib/types";

import type Database from "metabase-lib/lib/metadata/Database";
import type Field from "metabase-lib/lib/metadata/Field";

import type { SavedCard } from "metabase-types/types/Card";
import type { Database as IDatabase } from "metabase-types/types/Database";
import type { Parameter } from "metabase-types/types/Parameter";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

const AUTOMATIC_DATE_TIME_FIELDS = [
  TYPE.CreationDate,
  TYPE.CreationTemporal,
  TYPE.CreationTime,
  TYPE.CreationTimestamp,

  TYPE.DeletionDate,
  TYPE.DeletionTemporal,
  TYPE.DeletionTime,
  TYPE.DeletionTimestamp,

  TYPE.UpdatedDate,
  TYPE.UpdatedTemporal,
  TYPE.UpdatedTime,
  TYPE.UpdatedTimestamp,
];

const isAutomaticDateTimeField = (field: Field) => {
  return AUTOMATIC_DATE_TIME_FIELDS.includes(field.semantic_type);
};

export const isEditableField = (field: Field) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `database_required`
    return field.database_required;
  }

  if (isAutomaticDateTimeField(field)) {
    return field.database_required;
  }

  return true;
};

export const isActionButtonCard = (card: SavedCard) =>
  card?.display === "action-button";

export const isActionButtonDashCard = (dashCard: DashboardOrderedCard) =>
  isActionButtonCard(
    dashCard.visualization_settings?.virtual_card as SavedCard,
  );

export function getActionParameterType(parameter: Parameter) {
  const { type } = parameter;
  if (type === "category") {
    return "string/=";
  }
  return type;
}

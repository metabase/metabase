import type {
  Database as IDatabase,
  WritebackAction,
  ActionFormSettings,
} from "metabase-types/api";
import type { Parameter } from "metabase-types/types/Parameter";

import { TYPE } from "metabase-lib/types/constants";
import type Database from "metabase-lib/metadata/Database";
import type Field from "metabase-lib/metadata/Field";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.["database-enable-actions"];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature("actions");

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

export const isEditableField = (field: Field, parameter: Parameter) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `required`
    return parameter.required;
  }

  if (isAutomaticDateTimeField(field)) {
    return parameter.required;
  }

  return true;
};

export const hasImplicitActions = (actions: WritebackAction[]): boolean =>
  actions.some(isImplicitAction);

export const isImplicitAction = (action: WritebackAction): boolean =>
  action.type === "implicit";

export const shouldPrefetchValues = (action: WritebackAction) => {
  // in the future there should be a setting to configure this
  // for custom actions
  return action.type === "implicit" && action.kind === "row/update";
};

export const sortActionParams =
  (formSettings: ActionFormSettings) => (a: Parameter, b: Parameter) => {
    const aOrder = formSettings.fields[a.id]?.order ?? 0;
    const bOrder = formSettings.fields[b.id]?.order ?? 0;

    return aOrder - bOrder;
  };

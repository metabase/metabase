import { match } from "ts-pattern";
import { c, t } from "ttag";

import { getInputTypes } from "metabase/actions/constants";
import {
  getDefaultFieldSettings,
  inputTypeHasOptions,
} from "metabase/actions/utils";
import {
  hasActionsEnabled,
  hasNativeWritePermissions,
} from "metabase/common/utils/database";
import * as Lib from "metabase-lib";
import { getTemplateTagParameters } from "metabase-lib/v1/parameters/utils/template-tags";
import { isPK } from "metabase-lib/v1/types/utils/isa";
import type {
  ActionFormSettings,
  CreateQueryActionRequest,
  Database,
  FieldSettings,
  FieldType,
  FieldValueOptions,
  ImplicitActionKind,
  Table,
  TableId,
  TemplateTag,
  TemplateTagType,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

export type QueryActionDefinition = Required<
  Pick<
    CreateQueryActionRequest,
    "type" | "dataset_query" | "parameters" | "visualization_settings"
  >
>;

export type ImplicitActionDefinition = {
  type: "implicit";
  kind: ImplicitActionKind;
  table_id: TableId;
};

export type ActionDefinition = QueryActionDefinition | ImplicitActionDefinition;

export type ImplicitActionKindOption = {
  value: ImplicitActionKind;
  label: string;
  description: string;
};

export function getImplicitActionKindOptions(): ImplicitActionKindOption[] {
  return [
    {
      value: "row/create",
      label: t`Insert`,
      description: t`Adds a new row. The form asks for every column the database does not fill in.`,
    },
    {
      value: "row/update",
      label: t`Update`,
      description: t`Changes one row, found by its primary key. Empty fields keep their value.`,
    },
    {
      value: "row/delete",
      label: t`Delete`,
      description: t`Removes one row, found by its primary key.`,
    },
  ];
}

export function getImplicitActionKindOption(
  kind: ImplicitActionKind,
): ImplicitActionKindOption {
  const options = getImplicitActionKindOptions();
  return options.find((option) => option.value === kind) ?? options[0];
}

export function getImplicitActionName(
  kind: ImplicitActionKind,
  tableName: string,
) {
  return match(kind)
    .with("row/create", () => c("{0} is a table name").t`Insert ${tableName}`)
    .with("row/update", () => c("{0} is a table name").t`Update ${tableName}`)
    .with("row/delete", () => c("{0} is a table name").t`Delete ${tableName}`)
    .exhaustive();
}

const TAG_TYPE_BY_FIELD_TYPE: Record<FieldType, TemplateTagType> = {
  string: "text",
  number: "number",
  date: "date",
};

export function getQueryParameters(query: Lib.Query): WritebackParameter[] {
  return getTemplateTagParameters(Object.values(Lib.templateTags(query)));
}

function getFieldTypes(
  tag: TemplateTag | undefined,
): Pick<FieldSettings, "fieldType" | "inputType"> {
  switch (tag?.type) {
    case "number":
      return { fieldType: "number", inputType: "number" };
    case "date":
      return { fieldType: "date", inputType: "date" };
    default:
      return { fieldType: "string", inputType: "string" };
  }
}

function getFieldSettings(
  parameter: WritebackParameter,
  index: number,
  tag: TemplateTag | undefined,
  existing: FieldSettings | undefined,
): FieldSettings {
  const fieldTypes = getFieldTypes(tag);
  if (existing === undefined) {
    return getDefaultFieldSettings({
      id: parameter.id,
      name: parameter.name,
      title: parameter.name,
      order: index,
      required: parameter.required ?? true,
      ...fieldTypes,
    });
  }
  return existing.fieldType === fieldTypes.fieldType
    ? existing
    : getFieldSettingsForFieldType(existing, fieldTypes.fieldType);
}

/**
 * The form field settings for the variables of `query`, keeping the settings in `formSettings` and converting those whose variable type changed.
 */
export function getFieldSettingsFromQuery(
  query: Lib.Query,
  formSettings: ActionFormSettings,
): ActionFormSettings {
  const tags = Object.values(Lib.templateTags(query));
  const fields = Object.fromEntries(
    getQueryParameters(query).map((parameter, index) => [
      parameter.id,
      getFieldSettings(
        parameter,
        index,
        tags.find((tag) => tag.id === parameter.id),
        formSettings.fields?.[parameter.id],
      ),
    ]),
  );
  return { ...formSettings, fields };
}

/**
 * Whether the current user can change the query of `action`, which needs native query permissions on its database.
 */
export function canEditActionQuery(
  action: WritebackAction,
  databases: Database[],
): boolean {
  return (
    action.can_write === true &&
    databases.some(
      (database) =>
        database.id === action.database_id &&
        hasNativeWritePermissions(database),
    )
  );
}

export function setTemplateTagFieldType(
  query: Lib.Query,
  parameterId: string,
  fieldType: FieldType,
): Lib.Query {
  const tags = Object.fromEntries(
    Object.entries(Lib.templateTags(query)).map(([name, tag]) => [
      name,
      tag.id === parameterId
        ? { ...tag, type: TAG_TYPE_BY_FIELD_TYPE[fieldType] }
        : tag,
    ]),
  );
  return Lib.withTemplateTags(query, tags);
}

export function getQueryActionDefinition(
  query: Lib.Query,
  formSettings: ActionFormSettings,
): QueryActionDefinition | null {
  if (Lib.databaseID(query) == null) {
    return null;
  }
  return {
    type: "query",
    dataset_query: Lib.toJsQuery(query),
    parameters: getQueryParameters(query),
    visualization_settings: getFieldSettingsFromQuery(query, formSettings),
  };
}

export function canCreateActions(databases: Database[]): boolean {
  return databases.some(
    (database) =>
      hasActionsEnabled(database) && hasNativeWritePermissions(database),
  );
}

function cleanFieldValue(
  value: string | number | undefined,
  fieldType: FieldType,
) {
  if (value == null) {
    return value;
  }
  switch (fieldType) {
    case "string":
      return String(value);
    case "number": {
      const number = Number(value);
      return Number.isNaN(number) ? undefined : number;
    }
    default:
      return undefined;
  }
}

export function cleanOptionValues(
  values: FieldValueOptions,
  fieldType: FieldType,
): FieldValueOptions {
  return values
    .map((value) => cleanFieldValue(value, fieldType))
    .filter((value) => value != null);
}

/**
 * The field settings converted to `fieldType`, keeping the input type, options and default value where they still apply.
 */
export function getFieldSettingsForFieldType(
  fieldSettings: FieldSettings,
  fieldType: FieldType,
): FieldSettings {
  const inputTypes = getInputTypes()[fieldType].map((option) => option.value);
  const inputType = inputTypes.includes(fieldSettings.inputType)
    ? fieldSettings.inputType
    : inputTypes[0];

  return {
    ...fieldSettings,
    fieldType,
    inputType,
    valueOptions: inputTypeHasOptions(inputType)
      ? cleanOptionValues(fieldSettings.valueOptions ?? [], fieldType)
      : undefined,
    defaultValue: cleanFieldValue(fieldSettings.defaultValue, fieldType),
  };
}

export function hasSinglePrimaryKey(table: Table): boolean {
  return (table.fields ?? []).filter(isPK).length === 1;
}

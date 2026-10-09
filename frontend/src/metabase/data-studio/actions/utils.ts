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
import type {
  ActionFormSettings,
  CreateActionRequest,
  Database,
  FieldSettings,
  FieldType,
  FieldValueOptions,
  TemplateTag,
  TemplateTagType,
  WritebackAction,
  WritebackParameter,
} from "metabase-types/api";

export type ActionDefinition = Required<
  Pick<
    CreateActionRequest,
    "database_id" | "dataset_query" | "parameters" | "visualization_settings"
  >
>;

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

export function getActionDefinition(
  query: Lib.Query,
  formSettings: ActionFormSettings,
): ActionDefinition | null {
  const databaseId = Lib.databaseID(query);
  if (databaseId == null) {
    return null;
  }
  return {
    database_id: databaseId,
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

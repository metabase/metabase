import { getDefaultFieldSettings } from "metabase/actions/utils";
import * as Lib from "metabase-lib";
import { getTemplateTagParameters } from "metabase-lib/v1/parameters/utils/template-tags";
import type {
  ActionFormSettings,
  CreateActionRequest,
  Database,
  FieldSettings,
  FieldType,
  TemplateTag,
  TemplateTagType,
  WritebackParameter,
} from "metabase-types/api";

export type ActionDefinition = Required<
  Pick<
    CreateActionRequest,
    "database_id" | "dataset_query" | "parameters" | "visualization_settings"
  >
>;

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

/**
 * The form field settings for the variables of `query`, keeping the settings in `formSettings` whose type still matches.
 */
export function getFieldSettingsFromQuery(
  query: Lib.Query,
  formSettings: ActionFormSettings,
): ActionFormSettings {
  const tags = Object.values(Lib.templateTags(query));
  const fields = Object.fromEntries(
    getQueryParameters(query).map((parameter, index) => {
      const fieldTypes = getFieldTypes(
        tags.find((tag) => tag.id === parameter.id),
      );
      const existing = formSettings.fields?.[parameter.id];
      const field =
        existing?.fieldType === fieldTypes.fieldType
          ? existing
          : getDefaultFieldSettings({
              id: parameter.id,
              name: parameter.name,
              title: parameter.name,
              order: index,
              required: parameter.required ?? false,
              ...fieldTypes,
            });
      return [parameter.id, field];
    }),
  );
  return { ...formSettings, fields };
}

export function getTemplateTagType(fieldType: FieldType): TemplateTagType {
  switch (fieldType) {
    case "number":
      return "number";
    case "date":
      return "date";
    default:
      return "text";
  }
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
        ? { ...tag, type: getTemplateTagType(fieldType) }
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

export function isEditableActionDatabase(database: Database): boolean {
  return database.native_permissions === "write";
}

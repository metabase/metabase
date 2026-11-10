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
import { titleize } from "metabase/utils/formatting/strings";
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
  HttpActionBodyValue,
  HttpActionMethod,
  HttpActionTemplate,
  ImplicitActionKind,
  InputSettingType,
  ParameterType,
  Table,
  TableId,
  TemplateTag,
  TemplateTagType,
  WritebackAction,
  WritebackHttpAction,
  WritebackParameter,
} from "metabase-types/api";
import { isHttpActionBody } from "metabase-types/guards";

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

export type HttpActionDefinition = {
  type: "http";
  method: HttpActionMethod;
  url: string;
  query_params: Record<string, HttpActionTemplate>;
  headers: Record<string, HttpActionTemplate>;
  body: Record<string, HttpActionBodyValue> | null;
  parameters: WritebackParameter[];
  visualization_settings: ActionFormSettings;
};

export type ActionDefinition =
  | QueryActionDefinition
  | ImplicitActionDefinition
  | HttpActionDefinition;

export type HttpActionTemplateEntry = {
  name: string;
  value: string;
};

export type HttpActionRequest = {
  method: HttpActionMethod;
  url: string;
  queryParams: HttpActionTemplateEntry[];
  headers: HttpActionTemplateEntry[];
  body: string;
};

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
  return getTemplateTagParameters(Lib.templateTags(query));
}

type FieldTypes = {
  fieldType: FieldType;
  inputType: InputSettingType;
};

function getFieldTypes(fieldType: FieldType): FieldTypes {
  return match(fieldType)
    .with("number", () => ({ fieldType, inputType: "number" as const }))
    .with("date", () => ({ fieldType, inputType: "date" as const }))
    .with("string", () => ({ fieldType, inputType: "string" as const }))
    .exhaustive();
}

function getTagFieldType(tag: TemplateTag | undefined): FieldType {
  switch (tag?.type) {
    case "number":
      return "number";
    case "date":
      return "date";
    default:
      return "string";
  }
}

function getFieldSettings(
  parameter: WritebackParameter,
  index: number,
  fieldTypes: FieldTypes,
  existing: FieldSettings | undefined,
): FieldSettings {
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
  const tags = Lib.templateTags(query);
  const fields = Object.fromEntries(
    getQueryParameters(query).map((parameter, index) => [
      parameter.id,
      getFieldSettings(
        parameter,
        index,
        getFieldTypes(
          getTagFieldType(tags.find((tag) => tag.id === parameter.id)),
        ),
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
  const tags = Lib.templateTags(query).map((tag) =>
    tag.id === parameterId
      ? { ...tag, type: TAG_TYPE_BY_FIELD_TYPE[fieldType] }
      : tag,
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

const TEMPLATE_VARIABLE_REGEX = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

const PARAMETER_TYPE_BY_FIELD_TYPE: Record<FieldType, ParameterType> = {
  string: "string/=",
  number: "number/=",
  date: "date/single",
};

export const HTTP_ACTION_METHODS: HttpActionMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

export function getTemplateVariableNames(template: string): string[] {
  const names = Array.from(
    template.matchAll(TEMPLATE_VARIABLE_REGEX),
    ([, name]) => name,
  );
  return Array.from(new Set(names));
}

function getBodyStrings(value: HttpActionBodyValue): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(getBodyStrings);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(getBodyStrings);
  }
  return [];
}

function getRequestVariableNames(
  url: string,
  queryParams: Record<string, HttpActionTemplate>,
  headers: Record<string, HttpActionTemplate>,
  body: Record<string, HttpActionBodyValue> | null,
): string[] {
  const templates = [
    url,
    ...Object.values(queryParams),
    ...Object.values(headers),
    ...(body != null ? getBodyStrings(body) : []),
  ];
  return Array.from(new Set(templates.flatMap(getTemplateVariableNames)));
}

function getFieldTypeFromParameter(parameter: WritebackParameter): FieldType {
  return match(parameter.type)
    .with("number/=", () => "number" as const)
    .with("date/single", () => "date" as const)
    .otherwise(() => "string" as const);
}

function createHttpActionParameter(name: string): WritebackParameter {
  return {
    id: name,
    slug: name,
    name: titleize(name),
    type: PARAMETER_TYPE_BY_FIELD_TYPE.string,
    target: ["variable", ["template-tag", name]],
    required: true,
  };
}

export function getHttpActionParameters(
  names: string[],
  parameters: WritebackParameter[],
): WritebackParameter[] {
  return names.map(
    (name) =>
      parameters.find((parameter) => parameter.slug === name) ??
      createHttpActionParameter(name),
  );
}

export function getHttpActionFormSettings(
  parameters: WritebackParameter[],
  formSettings: ActionFormSettings,
): ActionFormSettings {
  const fields = Object.fromEntries(
    parameters.map((parameter, index) => [
      parameter.id,
      getFieldSettings(
        parameter,
        index,
        getFieldTypes(getFieldTypeFromParameter(parameter)),
        formSettings.fields?.[parameter.id],
      ),
    ]),
  );
  return { ...formSettings, fields };
}

export function getHttpActionParameterForFieldType(
  parameter: WritebackParameter,
  fieldType: FieldType,
): WritebackParameter {
  return { ...parameter, type: PARAMETER_TYPE_BY_FIELD_TYPE[fieldType] };
}

function getTemplateEntries(
  templates: Record<string, HttpActionTemplate> | null,
): HttpActionTemplateEntry[] {
  return Object.entries(templates ?? {}).map(([name, value]) => ({
    name,
    value,
  }));
}

function getTemplates(
  entries: HttpActionTemplateEntry[],
): Record<string, HttpActionTemplate> {
  return Object.fromEntries(
    entries
      .filter(({ name }) => name.trim().length > 0)
      .map(({ name, value }) => [name.trim(), value]),
  );
}

export type HttpActionRequestPart = "url" | "queryParams" | "headers" | "body";

export type HttpActionRequestVariable = {
  name: string;
  parts: HttpActionRequestPart[];
};

export function getHttpActionRequestVariables(
  request: HttpActionRequest,
): HttpActionRequestVariable[] {
  const templatesByPart: [HttpActionRequestPart, string[]][] = [
    ["url", [request.url]],
    ["queryParams", request.queryParams.map(({ value }) => value)],
    ["headers", request.headers.map(({ value }) => value)],
    ["body", [request.body]],
  ];
  const partsByName = new Map<string, HttpActionRequestPart[]>();
  templatesByPart.forEach(([part, templates]) => {
    templates.flatMap(getTemplateVariableNames).forEach((name) => {
      const parts = partsByName.get(name) ?? [];
      if (!parts.includes(part)) {
        partsByName.set(name, [...parts, part]);
      }
    });
  });
  return Array.from(partsByName, ([name, parts]) => ({ name, parts }));
}

export function getHttpActionRequest(
  action?: WritebackHttpAction,
): HttpActionRequest {
  return {
    method: action?.method ?? "POST",
    url: action?.url ?? "",
    queryParams: getTemplateEntries(action?.query_params ?? null),
    headers: getTemplateEntries(action?.headers ?? null),
    body: action?.body != null ? JSON.stringify(action.body, null, 2) : "",
  };
}

export type ParsedHttpActionBody =
  | { isValid: true; body: Record<string, HttpActionBodyValue> | null }
  | { isValid: false };

export function parseHttpActionBody(text: string): ParsedHttpActionBody {
  if (text.trim().length === 0) {
    return { isValid: true, body: null };
  }
  try {
    const value: unknown = JSON.parse(text);
    return isHttpActionBody(value)
      ? { isValid: true, body: value }
      : { isValid: false };
  } catch {
    return { isValid: false };
  }
}

export function getHttpActionDefinition(
  request: HttpActionRequest,
  parameters: WritebackParameter[],
  formSettings: ActionFormSettings,
): HttpActionDefinition | null {
  const url = request.url.trim();
  const parsedBody = parseHttpActionBody(request.body);
  if (url.length === 0 || !parsedBody.isValid) {
    return null;
  }
  const { body } = parsedBody;
  const queryParams = getTemplates(request.queryParams);
  const headers = getTemplates(request.headers);
  const nextParameters = getHttpActionParameters(
    getRequestVariableNames(url, queryParams, headers, body),
    parameters,
  );
  return {
    type: "http",
    method: request.method,
    url,
    query_params: queryParams,
    headers,
    body,
    parameters: nextParameters,
    visualization_settings: getHttpActionFormSettings(
      nextParameters,
      formSettings,
    ),
  };
}

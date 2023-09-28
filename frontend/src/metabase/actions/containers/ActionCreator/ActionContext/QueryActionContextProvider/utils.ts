import _ from "underscore";

import type {
  ActionFormSettings,
  FieldType,
  InputSettingType,
  Parameter,
  ParameterType,
  TemplateTag,
  TemplateTagType,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

type FieldTypeMap = Record<string, ParameterType>;
type TagTypeMap = Record<string, TemplateTagType>;

const fieldTypeToParameterTypeMap: FieldTypeMap = {
  string: "string/=",
  number: "number/=",
};

const dateTypeToParameterTypeMap: FieldTypeMap = {
  date: "date/single",
  datetime: "date/single",
  monthyear: "date/month-year",
  quarteryear: "date/quarter-year",
};

const fieldTypeToTagTypeMap: TagTypeMap = {
  string: "text",
  number: "number",
  date: "date",
};

const getTagTypeFromFieldSettings = (fieldType: FieldType): TemplateTagType => {
  return fieldTypeToTagTypeMap[fieldType] ?? "text";
};

const getParameterTypeFromFieldSettings = (
  fieldType: FieldType,
  inputType: InputSettingType,
): ParameterType => {
  if (fieldType === "date") {
    return dateTypeToParameterTypeMap[inputType] ?? "date/single";
  }

  return fieldTypeToParameterTypeMap[fieldType] ?? "string/=";
};

export const setTemplateTagTypesFromFieldSettings = (
  question: Question,
  settings: ActionFormSettings,
): Question => {
  const fields = settings.fields || {};
  const query = question.query() as NativeQuery;
  let tempQuestion = question.clone();

  query.variableTemplateTags().forEach((tag: TemplateTag) => {
    const currentQuery = tempQuestion.query() as NativeQuery;
    const fieldType = fields[tag.id]?.fieldType ?? "string";
    const nextTag = {
      ...tag,
      type: getTagTypeFromFieldSettings(fieldType),
    };
    tempQuestion = tempQuestion.setQuery(
      currentQuery.setTemplateTag(tag.name, nextTag),
    );
  });

  return tempQuestion;
};

export const setParameterTypesFromFieldSettings = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): Parameter[] => {
  const fields = settings.fields || {};
  return parameters.map(parameter => {
    const field = fields[parameter.id];
    return {
      ...parameter,
      type: field
        ? getParameterTypeFromFieldSettings(field.fieldType, field.inputType)
        : "string/=",
    };
  });
};

export const areActionsEqual = (
  action1: Partial<WritebackQueryAction>,
  action2: Partial<WritebackQueryAction>,
): boolean => {
  const { parameters: action1Parameters, ...action1Rest } = action1;
  const { parameters: action2Parameters, ...action2Rest } = action2;

  return (
    _.isEqual(action1Rest, action2Rest) &&
    _.isEqual(
      getCleanParameters(action1Parameters),
      getCleanParameters(action2Parameters),
    )
  );
};

/**
 * The presence of "value" and "hasVariableTemplateTagTarget" attributes
 * is due to Question usage in QueryActionContextProvider.
 * They are not useful in the context of creating/editing actions.
 * Note: "value" is used when running the action though.
 *
 * @see https://github.com/metabase/metabase/pull/28031
 */
const getCleanParameters = (parameters?: WritebackParameter[]) => {
  if (!parameters) {
    return parameters;
  }

  return parameters.map(parameter => {
    return _.omit(parameter, ["value", "hasVariableTemplateTagTarget"]);
  });
};

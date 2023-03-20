import type {
  ActionFormSettings,
  FieldType,
  InputSettingType,
  Parameter,
  ParameterType,
} from "metabase-types/api";
import type { TemplateTag, TemplateTagType } from "metabase-types/types/Query";

import type NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

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

import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  ActionFormSettings,
  FieldType,
  InputSettingType,
  Parameter,
  ParameterType,
  TemplateTag,
  TemplateTagType,
} from "metabase-types/api";

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
  const query = question.legacyQuery() as NativeQuery;
  let tempQuestion = question.clone();

  query.variableTemplateTags().forEach((tag: TemplateTag) => {
    const currentQuery = tempQuestion.legacyQuery() as NativeQuery;
    const fieldType = fields[tag.id]?.fieldType ?? "string";
    const nextTag = {
      ...tag,
      type: getTagTypeFromFieldSettings(fieldType),
    };
    tempQuestion = tempQuestion.setLegacyQuery(
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

import _ from "underscore";

import { getDefaultFieldSettings } from "metabase/actions/utils";

import type {
  ActionFormSettings,
  DatabaseId,
  FieldType,
  InputSettingType,
  NativeDatasetQuery,
  Parameter,
  ParameterType,
  VisualizationSettings,
  WritebackParameter,
  WritebackQueryAction,
} from "metabase-types/api";
import type { Card as LegacyCard } from "metabase-types/types/Card";
import type { TemplateTag, TemplateTagType } from "metabase-types/types/Query";

import type Metadata from "metabase-lib/metadata/Metadata";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import Question from "metabase-lib/Question";

type FieldTypeMap = Record<string, ParameterType>;

type TagTypeMap = Record<string, TemplateTagType>;

const fieldTypeToParameterTypeMap: FieldTypeMap = {
  string: "string/=",
  category: "string/=",
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
  category: "text",
  number: "number",
  date: "date",
};

// ActionCreator uses the NativeQueryEditor, which expects a Question object
// This utilities help us to work with the WritebackQueryAction as with a Question

export const newQuestion = (metadata: Metadata, databaseId?: number) => {
  return new Question(
    {
      dataset_query: {
        type: "native",
        database: databaseId ?? null,
        native: {
          query: "",
        },
      },
    },
    metadata,
  );
};

const getTagTypeFromFieldSettings = (fieldType: FieldType): TemplateTagType => {
  return fieldTypeToTagTypeMap[fieldType] ?? "text";
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

const getParameterTypeFromFieldSettings = (
  fieldType: FieldType,
  inputType: InputSettingType,
): ParameterType => {
  if (fieldType === "date") {
    return dateTypeToParameterTypeMap[inputType] ?? "date/single";
  }

  return fieldTypeToParameterTypeMap[fieldType] ?? "string/=";
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

export const syncFieldsWithParameters = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): ActionFormSettings => {
  const parameterIds = parameters.map(parameter => parameter.id);
  const fieldIds = Object.keys(settings.fields || {});
  const addedIds = _.difference(parameterIds, fieldIds);
  const removedIds = _.difference(fieldIds, parameterIds);

  if (!addedIds.length && !removedIds.length) {
    return settings;
  }

  return {
    ...settings,
    fields: {
      ..._.omit(settings.fields, removedIds),
      ...Object.fromEntries(
        addedIds.map(id => [id, getDefaultFieldSettings({ id })]),
      ),
    },
  };
};

export const convertQuestionToAction = (
  question: Question,
  formSettings: ActionFormSettings,
) => {
  const cleanQuestion = setTemplateTagTypesFromFieldSettings(
    question,
    formSettings,
  );
  const parameters = setParameterTypesFromFieldSettings(
    formSettings,
    cleanQuestion.parameters(),
  );

  return {
    id: question.id(),
    name: question.displayName() as string,
    description: question.description(),
    dataset_query: question.datasetQuery() as NativeDatasetQuery,
    database_id: question.databaseId() as DatabaseId,
    parameters: parameters as WritebackParameter[],
    visualization_settings: formSettings,
  };
};

const convertActionToQuestionCard = (
  action: WritebackQueryAction,
): LegacyCard<NativeDatasetQuery> => {
  return {
    id: action.id,
    name: action.name,
    description: action.description,
    dataset_query: action.dataset_query as NativeDatasetQuery,
    display: "action",
    visualization_settings:
      action.visualization_settings as VisualizationSettings,
  };
};

export const convertActionToQuestion = (
  action: WritebackQueryAction,
  metadata: Metadata,
) => {
  const question = new Question(convertActionToQuestionCard(action), metadata);
  return question.setParameters(action.parameters);
};

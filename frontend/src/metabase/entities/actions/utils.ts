import _ from "underscore";
import type {
  ActionFormSettings,
  FieldType,
  InputType,
  ParameterType,
  ModelAction,
} from "metabase-types/api";

import { getDefaultFieldSettings } from "metabase/writeback/components/ActionCreator/FormCreator";

import type { Parameter as ParameterObject } from "metabase-types/types/Parameter";
import type { TemplateTag, TemplateTagType } from "metabase-types/types/Query";
import type NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import type Question from "metabase-lib/lib/Question";

import {
  fieldTypeToParameterTypeMap,
  dateTypetoParameterTypeMap,
  fieldTypeToTagTypeMap,
} from "./constants";

export const removeOrphanSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ActionFormSettings => {
  const parameterIds = parameters.map(p => p.id);
  const fieldIds = Object.keys(settings.fields);
  const orphanIds = _.difference(fieldIds, parameterIds);

  return {
    ...settings,
    fields: _.omit(settings.fields, orphanIds),
  };
};

export const addMissingSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ActionFormSettings => {
  const parameterIds = parameters.map(p => p.id);
  const fieldIds = Object.keys(settings.fields);
  const missingIds = _.difference(parameterIds, fieldIds);

  if (!missingIds.length) {
    return settings;
  }

  return {
    ...settings,
    fields: {
      ...settings.fields,
      ...Object.fromEntries(
        missingIds.map(id => [id, getDefaultFieldSettings()]),
      ),
    },
  };
};

const getParameterTypeFromFieldSettings = (
  fieldType: FieldType,
  inputType: InputType,
): ParameterType => {
  if (fieldType === "date") {
    return dateTypetoParameterTypeMap[inputType] ?? "date/single";
  }

  return fieldTypeToParameterTypeMap[fieldType] ?? "string/=";
};

const getTagTypeFromFieldSettings = (fieldType: FieldType): TemplateTagType => {
  return fieldTypeToTagTypeMap[fieldType] ?? "text";
};

export const setParameterTypesFromFieldSettings = (
  settings: ActionFormSettings,
  parameters: ParameterObject[],
): ParameterObject[] => {
  const fields = settings.fields;
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

export const setTemplateTagTypesFromFieldSettings = (
  settings: ActionFormSettings,
  question: Question,
): Question => {
  const fields = settings.fields;

  (question.query() as NativeQuery)
    .templateTagsWithoutSnippets()
    .forEach((tag: TemplateTag) => {
      question = question.setQuery(
        (question.query() as NativeQuery).setTemplateTag(tag.name, {
          ...tag,
          type: getTagTypeFromFieldSettings(
            fields[tag.id]?.fieldType ?? "string",
          ),
        }),
      );
    });

  return question;
};

export const mapModelActionsToActions = (modelAction: ModelAction) => ({
  ...modelAction,
  model_action_id: modelAction.id,
  id: modelAction.action_id,
});

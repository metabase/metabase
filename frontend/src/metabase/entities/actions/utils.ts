import _ from "underscore";

import { getDefaultFieldSettings } from "metabase/actions/utils";

import type {
  ActionFormSettings,
  FieldType,
  InputSettingType,
  Parameter,
  ParameterType,
} from "metabase-types/api";
import type { TemplateTag, TemplateTagType } from "metabase-types/types/Query";
import type NativeQuery from "metabase-lib/queries/NativeQuery";
import type Question from "metabase-lib/Question";

import {
  fieldTypeToParameterTypeMap,
  dateTypeToParameterTypeMap,
  fieldTypeToTagTypeMap,
} from "./constants";

export const removeOrphanSettings = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): ActionFormSettings => {
  const parameterIds = parameters.map(p => p.id);
  return {
    ...settings,
    fields: _.pick(settings.fields, parameterIds),
  };
};

export const addMissingSettings = (
  settings: ActionFormSettings,
  parameters: Parameter[],
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
        missingIds.map(id => [id, getDefaultFieldSettings({ id })]),
      ),
    },
  };
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

const getTagTypeFromFieldSettings = (fieldType: FieldType): TemplateTagType => {
  return fieldTypeToTagTypeMap[fieldType] ?? "text";
};

export const setParameterTypesFromFieldSettings = (
  settings: ActionFormSettings,
  parameters: Parameter[],
): Parameter[] => {
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

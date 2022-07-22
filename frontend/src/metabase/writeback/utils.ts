import { TYPE } from "metabase/lib/types";

import {
  getTemplateTagParameterTarget,
  getTemplateTagType,
} from "metabase/parameters/utils/cards";

import Database from "metabase-lib/lib/metadata/Database";
import Field from "metabase-lib/lib/metadata/Field";

import { Database as IDatabase } from "metabase-types/types/Database";
import { TemplateTag } from "metabase-types/types/Query";
import { DashCard } from "metabase-types/types/Dashboard";
import {
  Parameter,
  ParameterId,
  ParameterTarget,
} from "metabase-types/types/Parameter";

import { WritebackAction, HttpAction, RowAction } from "./types";
import { ParameterWithTarget } from "metabase/parameters/types";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

const AUTOMATIC_DATE_TIME_FIELDS = [
  TYPE.CreationDate,
  TYPE.CreationTemporal,
  TYPE.CreationTime,
  TYPE.CreationTimestamp,

  TYPE.DeletionDate,
  TYPE.DeletionTemporal,
  TYPE.DeletionTime,
  TYPE.DeletionTimestamp,

  TYPE.UpdatedDate,
  TYPE.UpdatedTemporal,
  TYPE.UpdatedTime,
  TYPE.UpdatedTimestamp,
];

export const isAutomaticDateTimeField = (field: Field) => {
  return AUTOMATIC_DATE_TIME_FIELDS.includes(field.semantic_type);
};

export const isEditableField = (field: Field) => {
  const isRealField = typeof field.id === "number";
  if (!isRealField) {
    // Filters out custom, aggregated columns, etc.
    return false;
  }

  if (field.isPK()) {
    // Most of the time PKs are auto-generated,
    // but there are rare cases when they're not
    // In this case they're marked as `database_required`
    return field.database_required;
  }

  if (isAutomaticDateTimeField(field)) {
    return field.database_required;
  }

  return true;
};

export const isQueryAction = (
  action: WritebackAction,
): action is WritebackAction & RowAction => {
  return action.type === "query";
};

export const isHttpAction = (
  action: WritebackAction,
): action is WritebackAction & HttpAction => {
  return action.type === "http";
};

export const isActionButtonDashCard = (dashCard: DashCard) =>
  dashCard.visualization_settings?.virtual_card?.display === "action-button";

export const getActionButtonEmitterId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.emitter_id;

export const getActionButtonActionId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.action;

export function getActionTemplateTagType(tag: TemplateTag) {
  const { type } = tag;
  if (type === "date") {
    return "date/single";
  } else if (type === "text") {
    return "string/=";
  } else if (type === "number") {
    return "number/=";
  } else {
    return "string/=";
  }
}

export function getActionParameterType(parameter: Parameter) {
  const { type } = parameter;
  if (type === "category") {
    return "string/=";
  }
  return type;
}

export const getQueryActionParameterMappings = (
  action: WritebackAction & RowAction,
) => {
  const templateTags = Object.values(
    action.card.dataset_query.native["template-tags"],
  );

  const parameterMappings: Record<ParameterId, ParameterTarget> = {};

  templateTags.forEach(tag => {
    parameterMappings[tag.id] = getTemplateTagParameterTarget(tag);
  });

  return parameterMappings;
};

const getHttpActionParameterMappings = (
  action: WritebackAction & HttpAction,
) => {
  const parameters = Object.values(action.template.parameters);
  const parameterMappings: Record<ParameterId, ParameterTarget> = {};

  parameters.forEach(parameter => {
    parameterMappings[parameter.id] = [
      "variable",
      ["template-tag", parameter.name],
    ];
  });

  return parameterMappings;
};

export const getActionEmitterParameterMappings = (action: WritebackAction) => {
  return isQueryAction(action)
    ? getQueryActionParameterMappings(action)
    : getHttpActionParameterMappings(action);
};

export function getHttpActionTemplateTagParameter(
  tag: TemplateTag,
): ParameterWithTarget {
  return {
    id: tag.id,
    type: tag["widget-type"] || getTemplateTagType(tag),
    target: getTemplateTagParameterTarget(tag),
    name: tag.name,
    slug: tag.name,
    default: tag.default,
  };
}

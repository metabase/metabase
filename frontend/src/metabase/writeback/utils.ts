import { getTemplateTagParameterTarget } from "metabase/parameters/utils/cards";

import Database from "metabase-lib/lib/metadata/Database";
import Field from "metabase-lib/lib/metadata/Field";

import { Database as IDatabase } from "metabase-types/types/Database";
import { TemplateTag } from "metabase-types/types/Query";
import { DashCard } from "metabase-types/types/Dashboard";
import { ParameterId, ParameterTarget } from "metabase-types/types/Parameter";

import { WritebackAction } from "./types";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

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

  return true;
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
    return "category";
  }
}

export const getActionEmitterParameterMappings = (action: WritebackAction) => {
  if (action.type === "http") {
    return {};
  }

  const templateTags = Object.values(
    action.card.dataset_query.native["template-tags"],
  );

  const parameterMappings: Record<ParameterId, ParameterTarget> = {};

  templateTags.forEach(tag => {
    parameterMappings[tag.id] = getTemplateTagParameterTarget(tag);
  });

  return parameterMappings;
};

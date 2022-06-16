import { getTemplateTagParameterTarget } from "metabase/parameters/utils/cards";

import Database from "metabase-lib/lib/metadata/Database";

import { Database as IDatabase } from "metabase-types/types/Database";
import { DashCard } from "metabase-types/types/Dashboard";
import { ParameterId, ParameterTarget } from "metabase-types/types/Parameter";

import { WritebackAction } from "./types";

const DB_WRITEBACK_FEATURE = "actions";
const DB_WRITEBACK_SETTING = "database-enable-actions";

export const isDatabaseWritebackEnabled = (database?: IDatabase | null) =>
  !!database?.settings?.[DB_WRITEBACK_SETTING];

export const isWritebackSupported = (database?: Database | null) =>
  !!database?.hasFeature(DB_WRITEBACK_FEATURE);

export const isActionButtonDashCard = (dashCard: DashCard) =>
  dashCard.visualization_settings?.virtual_card?.display === "action-button";

export const getActionButtonEmitterId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.emitter_id;

export const getActionButtonActionId = (dashCard: DashCard) =>
  dashCard.visualization_settings?.click_behavior?.action;

export const getActionEmitterParameterMappings = (action: WritebackAction) => {
  const templateTags = Object.values(
    action.card.dataset_query.native["template-tags"],
  );

  const parameterMappings: Record<ParameterId, ParameterTarget> = {};

  templateTags.forEach(tag => {
    parameterMappings[tag.id] = getTemplateTagParameterTarget(tag);
  });

  return parameterMappings;
};

import { getTemplateTagParameterTarget } from "metabase/parameters/utils/cards";

import Database from "metabase-lib/lib/metadata/Database";

import { Database as IDatabase } from "metabase-types/types/Database";
import { DashCard } from "metabase-types/types/Dashboard";
import { ParameterTarget } from "metabase-types/types/Parameter";

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

export const getActionEmitterParameterMappings = (
  dashCard: DashCard,
  action: WritebackAction,
) => {
  const { click_behavior } = dashCard.visualization_settings;

  const templateTags = Object.values(
    action.card.dataset_query.native["template-tags"],
  );

  const parameterMappings: Record<string, ParameterTarget> = {};

  Object.keys(click_behavior.parameterMapping).forEach(targetVariableId => {
    const templateTag = templateTags.find(tag => tag.id === targetVariableId);
    if (templateTag) {
      parameterMappings[targetVariableId] = getTemplateTagParameterTarget(
        templateTag,
      );
    }
  });

  return parameterMappings;
};

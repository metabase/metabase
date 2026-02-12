import type { CardId } from "./card";
import type { ConcreteTableId } from "./table";

export type ReplaceSourceEntityId = ConcreteTableId | CardId;

export const REPLACE_SOURCE_ENTITY_TYPES = ["card", "table"] as const;
export type ReplaceSourceEntityType =
  (typeof REPLACE_SOURCE_ENTITY_TYPES)[number];

export type ReplaceSourceEntry = {
  id: ReplaceSourceEntityId;
  type: ReplaceSourceEntityType;
};

export type ReplaceSourceRequest = {
  source_entity_id: ReplaceSourceEntityId;
  source_entity_type: ReplaceSourceEntityType;
  target_entity_id: ReplaceSourceEntityId;
  target_entity_type: ReplaceSourceEntityType;
};

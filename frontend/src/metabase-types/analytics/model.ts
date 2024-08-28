import type { CardId } from "metabase-types/api";

export type IndexModelEntitiesEnabledEvent = {
  event: "index_model_entities_enabled";
  model_id: CardId;
};

export type ModelEvent = IndexModelEntitiesEnabledEvent;

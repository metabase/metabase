import type { ValidateSchema } from "./utils";

type ModelEventSchema = {
  event: string;
  model_id: number;
};

type ValidateEvent<T extends ModelEventSchema> = ValidateSchema<
  T,
  ModelEventSchema
>;

export type IndexModelEntitiesEnabledEvent = ValidateEvent<{
  event: "index_model_entities_enabled";
  model_id: number;
}>;

export type ModelEvent = IndexModelEntitiesEnabledEvent;

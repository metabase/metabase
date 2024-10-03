type ModelEventSchema = {
  event: string;
  model_id: number;
};

type ValidateEvent<
  T extends ModelEventSchema &
    Record<Exclude<keyof T, keyof ModelEventSchema>, never>,
> = T;

export type IndexModelEntitiesEnabledEvent = ValidateEvent<{
  event: "index_model_entities_enabled";
  model_id: number;
}>;

export type ModelEvent = IndexModelEntitiesEnabledEvent;

import type { CardId } from "./card";
import type { DimensionReference } from "./query";

export type NormalizedIndexedEntity = IndexedEntity;

export type ModelIndex = {
  id: number;
  model_id: CardId;
  value_ref: DimensionReference;
  pk_ref: DimensionReference;
  state: "indexed" | "pending";
  creator_id: number;
  error: string | null;
  schedule: string; // cron string
  created_at: string; // datetime
  indexed_at: string; // datetime
};

export type IndexedEntity = {
  id: number;
  model_id: CardId;
  model: "indexed-entity";
  model_name: string;
  name: string;
  pk_ref: DimensionReference;
};

export type ModelIndexesListQuery = {
  model_id: CardId | null;
};

export type ModelIndexCreateQuery = Pick<
  ModelIndex,
  "model_id" | "pk_ref" | "value_ref"
>;

export type ModelIndexDeleteQuery = {
  id: number;
};

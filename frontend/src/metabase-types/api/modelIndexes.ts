import type { CardId } from "./card";
import type { FieldReference } from "./query";

export type NormalizedModelIndex = ModelIndex;
export type NormalizedIndexedEntity = IndexedEntity;

export type ModelIndex = {
  id: number;
  model_id: CardId;
  value_ref: FieldReference;
  pk_ref: FieldReference;
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
  pk_ref: FieldReference;
};

export type ModelIndexesListQuery = {
  model_id: CardId | null;
};

import type { CardId } from "./card";
import type { FieldReference } from "./query";

export type ModelIndex = {
  id: number;
  model_id: CardId;
  value_ref: FieldReference;
  pk_ref: FieldReference;
  state: "indexed" | "pending";
};

export type IndexedEntity = {
  id: number;
  model_id: CardId;
  model: "indexed-entity";
  model_name: string;
  name: string;
  pk_ref: FieldReference;
};

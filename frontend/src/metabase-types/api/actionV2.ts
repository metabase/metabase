import type { Card } from "metabase-types/api/card";
import type { CollectionId } from "metabase-types/api/collection";

export type ActionV2ListModelItem = Pick<
  Card,
  "id" | "name" | "description" | "collection_position"
> & {
  collection_id: CollectionId;
  collection_name: string;
};

export interface ActionV2ListModelsResponse {
  models: ActionV2ListModelItem[];
}

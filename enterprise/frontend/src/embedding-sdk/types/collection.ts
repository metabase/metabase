import type { SdkUserId } from "embedding-sdk/types/user";

import type { SdkEntityId } from "./entity-id";

// "CollectionId" from core app also includes "root" | "users" and "trash", we don't want to include those
// in public apis of the sdk, as we don't support them

export type SdkCollectionId = number | "personal" | "root" | SdkEntityId;

/**
 * The Collection entity
 */
export type MetabaseCollection = {
  id: SdkCollectionId;
  name: string;
  slug?: string;
  entity_id?: SdkEntityId;
  description: string | null;
};

/**
 * The CollectionItem entity
 */
export type MetabaseCollectionItem = {
  id: SdkCollectionId;
  entity_id?: SdkEntityId;
  model: string;
  name: string;
  description: string | null;
  type?:
    | "instance-analytics"
    | "trash"
    | "model"
    | "question"
    | "metric"
    | null;
  "last-edit-info"?: {
    email: string;
    first_name: string;
    last_name: string;
    id: SdkUserId;
    timestamp: string;
  };
};

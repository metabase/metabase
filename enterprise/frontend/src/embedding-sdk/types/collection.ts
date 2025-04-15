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
  children?: MetabaseCollection[];
  type?: "instance-analytics" | "trash" | null;

  parent_id?: SdkCollectionId | null;
  personal_owner_id?: SdkUserId;
  location: string | null;
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
  archived: boolean;
  copy?: boolean;
  collection_position?: number | null;
  collection_preview?: boolean | null;
  fully_parameterized?: boolean | null;
  collection?: MetabaseCollection | null;
  collection_id: SdkCollectionId | null; // parent collection id
  display?: string;
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
  location?: string;
  effective_location?: string;
  dashboard_count?: number | null;
};

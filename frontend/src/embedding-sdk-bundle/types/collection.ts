import type { SdkUserId } from "embedding-sdk-bundle/types/user";

import type { SdkEntityId } from "./entity";

// "CollectionId" from core app also includes "root" | "users" and "trash", we don't want to include those
// in public apis of the sdk, as we don't support them

export type SdkCollectionId =
  | number
  | "personal"
  | "root"
  | "tenant"
  | SdkEntityId;

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
  namespace?: string | null;
  collection_namespace?: string | null;
  type?:
    | "instance-analytics"
    | "trash"
    | "remote-synced"
    | "library"
    | "library-data"
    | "library-metrics"
    | "shared-tenant-collection"
    | "tenant-specific-root-collection"
    | "model"
    | "question"
    | "metric"
    | null;
  is_remote_synced?: boolean;
  "last-edit-info"?: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    id: SdkUserId;
    timestamp: string;
  };
};

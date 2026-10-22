import { t } from "ttag";

import type {
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase/common/collections/types";
import type { BaseEntityId } from "metabase-types/api";

export const REGULAR_COLLECTION: CollectionAuthorityLevelConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

export const REMOTE_SYNC_COLLECTION: CollectionInstanceAnaltyicsConfig = {
  type: null,
  icon: "synced_collection",
};

export const OFFICIAL_COLLECTION: CollectionAuthorityLevelConfig = {
  type: "official",
  get name() {
    return t`Official`;
  },
  icon: "official_collection",
  color: "core-yellow-saturated" as const,
  tooltips: {
    get default() {
      return t`Official collection`;
    },
    get belonging() {
      return t`Belongs to an Official collection`;
    },
  },
};

export const INSTANCE_ANALYTICS_COLLECTION: CollectionInstanceAnaltyicsConfig =
  {
    type: "instance-analytics",
    get name() {
      return t`Instance Analytics`;
    },
    icon: "audit",
  };

export const AUTHORITY_LEVELS: Record<string, CollectionAuthorityLevelConfig> =
  {
    [String(OFFICIAL_COLLECTION.type)]: OFFICIAL_COLLECTION,
    [String(REGULAR_COLLECTION.type)]: REGULAR_COLLECTION,
  };

export const COLLECTION_TYPES: Record<
  string,
  CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig
> = {
  [String(OFFICIAL_COLLECTION.type)]: OFFICIAL_COLLECTION,
  [String(REGULAR_COLLECTION.type)]: REGULAR_COLLECTION,
  [String(INSTANCE_ANALYTICS_COLLECTION.type)]: INSTANCE_ANALYTICS_COLLECTION,
};

export const CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID =
  // Unjustified type cast. FIXME
  "okNLSZKdSxaoG58JSQY54" as BaseEntityId;

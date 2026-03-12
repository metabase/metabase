import { t } from "ttag";

import type {
  BaseEntityId,
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

export const REGULAR_COLLECTION: CollectionAuthorityLevelConfig = {
  type: null,
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  name: t`Regular`,
  icon: "folder",
};

export const REMOTE_SYNC_COLLECTION: CollectionInstanceAnaltyicsConfig = {
  type: null,
  icon: "synced_collection",
};

export const OFFICIAL_COLLECTION: CollectionAuthorityLevelConfig = {
  type: "official",
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  name: t`Official`,
  icon: "official_collection",
  color: "saturated-yellow" as const,
  tooltips: {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    default: t`Official collection`,
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    belonging: t`Belongs to an Official collection`,
  },
};

export const INSTANCE_ANALYTICS_COLLECTION: CollectionInstanceAnaltyicsConfig =
  {
    type: "instance-analytics",
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Instance Analytics`,
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
  "okNLSZKdSxaoG58JSQY54" as BaseEntityId;

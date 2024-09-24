import { t } from "ttag";

import type {
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

export const REGULAR_COLLECTION: CollectionAuthorityLevelConfig = {
  type: null,
  name: t`Regular`,
  icon: "folder",
};

export const OFFICIAL_COLLECTION: CollectionAuthorityLevelConfig = {
  type: "official",
  name: t`Official`,
  icon: "verified_collection",
  color: "saturated-yellow",
  tooltips: {
    default: t`Official collection`,
    belonging: t`Belongs to an Official collection`,
  },
};

export const INSTANCE_ANALYTICS_COLLECTION: CollectionInstanceAnaltyicsConfig =
  {
    type: "instance-analytics",
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
  "okNLSZKdSxaoG58JSQY54";

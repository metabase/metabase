import { t } from "ttag";

import type {
  BaseEntityId,
  CollectionAuthorityLevelConfig,
  CollectionInstanceAnaltyicsConfig,
} from "metabase-types/api";

export const getRegularCollection = (): CollectionAuthorityLevelConfig => ({
  type: null,
  name: t`Regular`,
  icon: "folder",
});

export const getOfficialCollection = (): CollectionAuthorityLevelConfig => ({
  type: "official",
  name: t`Official`,
  icon: "official_collection",
  color: "saturated-yellow",
  tooltips: {
    default: t`Official collection`,
    belonging: t`Belongs to an Official collection`,
  },
});

export const getInstanceAnalyticsCollection = (): CollectionInstanceAnaltyicsConfig => ({
  type: "instance-analytics",
  name: t`Instance Analytics`,
  icon: "audit",
});

export const getAuthorityLevels = (): Record<string, CollectionAuthorityLevelConfig> => {
  const officialCollection = getOfficialCollection();
  const regularCollection = getRegularCollection();
  return {
    [String(officialCollection.type)]: officialCollection,
    [String(regularCollection.type)]: regularCollection,
  };
};

export const getCollectionTypes = (): Record<
  string,
  CollectionAuthorityLevelConfig | CollectionInstanceAnaltyicsConfig
> => {
  const officialCollection = getOfficialCollection();
  const regularCollection = getRegularCollection();
  const instanceAnalyticsCollection = getInstanceAnalyticsCollection();
  return {
    [String(officialCollection.type)]: officialCollection,
    [String(regularCollection.type)]: regularCollection,
    [String(instanceAnalyticsCollection.type)]: instanceAnalyticsCollection,
  };
};

export const CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID =
  "okNLSZKdSxaoG58JSQY54" as BaseEntityId;

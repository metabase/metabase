import { t } from "ttag";

import type { CollectionInstanceAnaltyicsConfig } from "metabase/common/collections/types";
import type { BaseEntityId } from "metabase-types/api";

export const REGULAR_COLLECTION: CollectionInstanceAnaltyicsConfig = {
  type: null,
  get name() {
    return t`Regular`;
  },
  icon: "folder",
};

export const INSTANCE_ANALYTICS_COLLECTION: CollectionInstanceAnaltyicsConfig =
  {
    type: "instance-analytics",
    get name() {
      return t`Instance Analytics`;
    },
    icon: "audit",
  };

export const COLLECTION_TYPES: Record<
  string,
  CollectionInstanceAnaltyicsConfig
> = {
  [String(REGULAR_COLLECTION.type)]: REGULAR_COLLECTION,
  [String(INSTANCE_ANALYTICS_COLLECTION.type)]: INSTANCE_ANALYTICS_COLLECTION,
};

export const CUSTOM_INSTANCE_ANALYTICS_COLLECTION_ENTITY_ID =
  // Unjustified type cast. FIXME
  "okNLSZKdSxaoG58JSQY54" as BaseEntityId;

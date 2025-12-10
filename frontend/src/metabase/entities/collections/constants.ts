import { t } from "ttag";

import type { CollectionId } from "metabase-types/api";

export const DEFAULT_COLLECTION_COLOR_ALIAS = "brand";

export const ROOT_COLLECTION = {
  id: "root" as CollectionId,
  get name() {
    return t`Our analytics`;
  },
  location: "",
  path: [],
  is_personal: false,
};

export const PERSONAL_COLLECTION = {
  id: undefined, // to be filled in by getExpandedCollectionsById
  get name() {
    return t`My personal collection`;
  },
  location: "/",
  path: [ROOT_COLLECTION.id],
  can_write: true,
  is_personal: true,
};

// fake collection for admins that contains all other user's collections
export const PERSONAL_COLLECTIONS = {
  id: "personal" as CollectionId,
  get name() {
    return t`All personal collections`;
  },
  location: "/",
  path: [ROOT_COLLECTION.id],
  can_write: false,
  is_personal: true,
};

export const DATABASES_COLLECTION = {
  id: "databases" as const,
  get name() {
    return t`Databases`;
  },
  location: "/",
  can_write: false,
};

import { t } from "ttag";
import { Collection } from "metabase-types/api";

export const DEFAULT_COLLECTION_COLOR_ALIAS = "brand";

export const ROOT_COLLECTION: Collection = {
  id: "root",
  name: t`Our analytics`,
  location: "",
  path: [],
  can_write: false,
  description: null,
  archived: false,
};

export const PERSONAL_COLLECTION = {
  id: undefined, // to be filled in by getExpandedCollectionsById
  name: t`My personal collection`,
  location: "/",
  path: [ROOT_COLLECTION.id],
  can_write: true,
};

// fake collection for admins that contains all other user's collections
export const PERSONAL_COLLECTIONS = {
  id: "personal", // placeholder id
  name: t`All personal collections`,
  location: "/",
  path: [ROOT_COLLECTION.id],
  can_write: false,
};

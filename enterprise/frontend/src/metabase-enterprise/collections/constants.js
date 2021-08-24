import { t } from "ttag";

export const REGULAR_COLLECTION = {
  type: null,
  name: t`Regular`,
  icon: "folder",
};

export const OFFICIAL_COLLECTION = {
  type: "official",
  name: t`Official`,
  icon: "badge",
  color: "saturated-yellow",
};

export const AUTHORITY_LEVELS = {
  [OFFICIAL_COLLECTION.type]: OFFICIAL_COLLECTION,
  [REGULAR_COLLECTION.type]: REGULAR_COLLECTION,
};

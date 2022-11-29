import { t } from "ttag";
import type { CollectionAuthorityLevel } from "metabase-types/api";

type AuthorityLevelConfig = {
  type: CollectionAuthorityLevel;
  name: string;
  icon: string;
  color?: string;
  tooltips?: Record<string, string>;
};

export const REGULAR_COLLECTION: AuthorityLevelConfig = {
  type: null,
  name: t`Regular`,
  icon: "folder",
};

export const OFFICIAL_COLLECTION: AuthorityLevelConfig = {
  type: "official",
  name: t`Official`,
  icon: "badge",
  color: "saturated-yellow",
  tooltips: {
    default: t`Official collection`,
    belonging: t`Belongs to an Official collection`,
  },
};

export const AUTHORITY_LEVELS: Record<any, AuthorityLevelConfig> = {
  [OFFICIAL_COLLECTION.type as any]: OFFICIAL_COLLECTION,
  [REGULAR_COLLECTION.type as any]: REGULAR_COLLECTION,
};

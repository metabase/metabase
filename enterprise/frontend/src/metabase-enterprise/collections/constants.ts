import { t } from "ttag";
import type { CollectionAuthorityLevel } from "metabase-types/api";
import type { IconName } from "metabase/core/components/Icon";

type AuthorityLevelConfig = {
  type: CollectionAuthorityLevel;
  name: string;
  icon: IconName;
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

export const AUTHORITY_LEVELS: Record<string, AuthorityLevelConfig> = {
  [String(OFFICIAL_COLLECTION.type)]: OFFICIAL_COLLECTION,
  [String(REGULAR_COLLECTION.type)]: REGULAR_COLLECTION,
};

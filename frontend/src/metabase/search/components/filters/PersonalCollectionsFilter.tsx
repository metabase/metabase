import { t } from "ttag";

import type { SearchFilterToggle } from "metabase/search/types";

export const PersonalCollectionsFilter: SearchFilterToggle = {
  label: () => t`Search personal collections`,
  type: "toggle",
  fromUrl: (value) => value === "only",
  toUrl: (value: boolean) => (value ? "only" : null),
};

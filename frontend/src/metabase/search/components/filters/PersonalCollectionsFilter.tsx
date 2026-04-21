import { t } from "ttag";

import type { SearchFilterToggle } from "metabase/search/types";

export const PersonalCollectionsFilter: SearchFilterToggle = {
  label: () => t`Search all personal collections`,
  type: "toggle",
  fromUrl: (value) => value === "all",
  toUrl: (value: boolean) => (value ? "all" : null),
};

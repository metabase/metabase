import { t } from "ttag";

import type { SearchFilterToggle } from "metabase/search/types";

export const SearchTrashedItemsFilter: SearchFilterToggle = {
  label: () => t`Search items in trash`,
  type: "toggle",
  fromUrl: value => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};

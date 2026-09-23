import { t } from "ttag";

import type { SearchFilterComponent } from "metabase/common/search/types";

export const VibesFilter: SearchFilterComponent<"vibes"> = {
  label: () => t`Order by vibes`,
  type: "toggle",
  fromUrl: (value) => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};

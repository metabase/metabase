import { t } from "ttag";

import type { SearchFilterComponent } from "metabase/search/types";

export const VerifiedFilter: SearchFilterComponent<"verified"> = {
  label: () => t`Verified items only`,
  type: "toggle",
  fromUrl: value => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};

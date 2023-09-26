import { t } from "ttag";
import type { SearchFilterComponent } from "metabase/search/types";

export const VerifiedFilter: SearchFilterComponent<"verified"> = {
  title: t`Verified items only`,
  type: "toggle",
  fromUrl: value => value === "true",
  toUrl: (value: boolean) => (value ? "true" : undefined),
};

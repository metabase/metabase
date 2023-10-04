import { t } from "ttag";
import type { SearchFilterToggle } from "metabase/search/types";

export const SQLNativeQueryFilter: SearchFilterToggle = {
  label: t`Search the contents of SQL queries`,
  type: "toggle",
  fromUrl: value => value === "true",
  toUrl: (value: boolean) => (value ? "true" : null),
};

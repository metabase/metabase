import { t } from "ttag";
import type { SearchFilterComponent } from "metabase/search/types";
import { SearchFilterDateDisplay } from "metabase/search/components/SearchFilterDateDisplay/SearchFilterDateDisplay";
import { SearchFilterDatePicker } from "metabase/search/components/SearchFilterDatePicker/SearchFilterDatePicker";

export const CreatedAtFilter: SearchFilterComponent<"created_at"> = {
  iconName: "person",
  title: t`Creation date`,
  type: "dropdown",
  DisplayComponent: SearchFilterDateDisplay,
  ContentComponent: SearchFilterDatePicker,
  fromUrl: value => value,
  toUrl: value => value,
};

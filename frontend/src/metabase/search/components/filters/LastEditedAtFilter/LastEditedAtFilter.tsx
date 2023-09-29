/* eslint-disable react/prop-types */
import { t } from "ttag";
import type { SearchFilterComponent } from "metabase/search/types";
import { SearchFilterDateDisplay } from "metabase/search/components/SearchFilterDateDisplay/SearchFilterDateDisplay";
import { SearchFilterDatePicker } from "metabase/search/components/SearchFilterDatePicker/SearchFilterDatePicker";

export const LastEditedAtFilter: SearchFilterComponent<"last_edited_at"> = {
  iconName: "person",
  title: t`Creation date`,
  type: "dropdown",
  DisplayComponent: ({ value }) => (
    <SearchFilterDateDisplay title={LastEditedAtFilter.title} value={value} />
  ),
  ContentComponent: SearchFilterDatePicker,
  fromUrl: value => value,
  toUrl: value => value,
};

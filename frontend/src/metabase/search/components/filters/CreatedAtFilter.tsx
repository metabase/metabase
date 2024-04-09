/* eslint-disable react/prop-types */
import { t } from "ttag";

import { SearchFilterDateDisplay } from "metabase/search/components/SearchFilterDateDisplay";
import { SearchFilterDatePicker } from "metabase/search/components/SearchFilterDatePicker";
import type { SearchFilterDropdown } from "metabase/search/types";
import { Box } from "metabase/ui";

export const CreatedAtFilter: SearchFilterDropdown<"created_at"> = {
  iconName: "calendar",
  label: () => t`Creation date`,
  type: "dropdown",
  DisplayComponent: ({ value: dateString }) => (
    <SearchFilterDateDisplay
      label={CreatedAtFilter.label()}
      value={dateString}
    />
  ),
  ContentComponent: ({ value, onChange, width }) => (
    <Box miw={width} maw="30rem">
      <SearchFilterDatePicker value={value} onChange={onChange} />
    </Box>
  ),
  fromUrl: value => value,
  toUrl: value => value,
};

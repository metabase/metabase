import { t } from "ttag";

import type { SearchFilterDropdown } from "metabase/common/search/types";
import { SearchFilterDateDisplay } from "metabase/querying/filters/components/SearchFilterDateDisplay";
import { SearchFilterDatePicker } from "metabase/querying/filters/components/SearchFilterDatePicker";
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
    <Box miw={width}>
      <SearchFilterDatePicker value={value} onChange={onChange} />
    </Box>
  ),
  fromUrl: (value) => value,
  toUrl: (value) => value,
};

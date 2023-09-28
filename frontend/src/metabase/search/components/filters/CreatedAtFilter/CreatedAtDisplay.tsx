/* eslint-disable react/prop-types */
import type { SearchFilterDropdown } from "metabase/search/types";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtFilter";
import { Text } from "metabase/ui";
import { getFilterTitle } from "metabase/parameters/utils/date-formatting";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

export const CreatedAtDisplay: SearchFilterDropdown<"created_at">["DisplayComponent"] =
  ({ value }) => {
    const dateFilter = value != null && dateParameterValueToMBQL(value, null);

    return (
      <Text c="inherit" fw={700} truncate>
        {value ? getFilterTitle(dateFilter) : CreatedAtFilter.title}
      </Text>
    );
  };

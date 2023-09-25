/* eslint-disable react/prop-types */
import type { SearchSidebarFilterComponent } from "metabase/search/types";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter/CreatedAtFilter";
import { Text } from "metabase/ui";
import { getFilterTitle } from "metabase/parameters/utils/date-formatting";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

export const CreatedAtDisplay: SearchSidebarFilterComponent<"created_at">["DisplayComponent"] =
  ({ value }) => {
    const dateFilter = value != null && dateParameterValueToMBQL(value, null);

    return (
      <Text c="inherit" fw={700}>
        {dateFilter ? getFilterTitle(dateFilter) : CreatedAtFilter.title}
      </Text>
    );
  };

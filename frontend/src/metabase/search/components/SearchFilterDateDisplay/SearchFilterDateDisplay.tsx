import { Text } from "metabase/ui";
import { getFilterTitle } from "metabase/parameters/utils/date-formatting";
import { CreatedAtFilter } from "metabase/search/components/filters/CreatedAtFilter";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

export const SearchFilterDateDisplay = ({
  value,
}: {
  value: string | null;
}) => {
  const dateFilter = value != null && dateParameterValueToMBQL(value, null);

  return (
    <Text c="inherit" fw={700} truncate>
      {value ? getFilterTitle(dateFilter) : CreatedAtFilter.title}
    </Text>
  );
};

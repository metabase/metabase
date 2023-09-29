import { Text } from "metabase/ui";
import { getFilterTitle } from "metabase/parameters/utils/date-formatting";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

export type SearchFilterDateDisplayProps = {
  title: string;
  value: string | null;
};
export const SearchFilterDateDisplay = ({
  title,
  value,
}: SearchFilterDateDisplayProps) => {
  const dateFilter = dateParameterValueToMBQL(value, null);

  return (
    <Text c="inherit" fw={700} truncate>
      {dateFilter ? getFilterTitle(dateFilter) : title}
    </Text>
  );
};

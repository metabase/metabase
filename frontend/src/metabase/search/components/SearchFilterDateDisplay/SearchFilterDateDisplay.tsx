import { getFilterTitle } from "metabase/parameters/utils/date-formatting";
import { Text } from "metabase/ui";
import { dateParameterValueToMBQL } from "metabase-lib/v1/parameters/utils/mbql";

export type SearchFilterDateDisplayProps = {
  label: string;
  value: string | null;
};
export const SearchFilterDateDisplay = ({
  label,
  value,
}: SearchFilterDateDisplayProps) => {
  const dateFilter = dateParameterValueToMBQL(value, null);

  return (
    <Text c="inherit" fw={700} truncate>
      {dateFilter ? getFilterTitle(dateFilter) : label}
    </Text>
  );
};

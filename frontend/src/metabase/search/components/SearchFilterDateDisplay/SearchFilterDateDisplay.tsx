import { formatDateFilter } from "metabase/querying/filters/utils/dates";
import { deserializeDateFilter } from "metabase/querying/parameters/utils/dates";
import { Text } from "metabase/ui";

export type SearchFilterDateDisplayProps = {
  label: string;
  value: string | null;
};
export const SearchFilterDateDisplay = ({
  label,
  value,
}: SearchFilterDateDisplayProps) => {
  const dateFilter = value ? deserializeDateFilter(value) : undefined;

  return (
    <Text c="inherit" fw={700} truncate>
      {dateFilter ? formatDateFilter(dateFilter) : label}
    </Text>
  );
};

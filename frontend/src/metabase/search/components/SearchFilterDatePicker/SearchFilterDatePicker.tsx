import { useState } from "react";
import { t } from "ttag";
import { SearchFilterApplyButton } from "metabase/search/components/SearchFilterPopoverWrapper/SearchFilterPopoverWrapper";
import { filterToUrlEncoded } from "metabase/parameters/utils/date-formatting";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import type { DateShortcutOptions } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { DATE_SHORTCUT_OPTIONS } from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

const CREATED_AT_SHORTCUTS: DateShortcutOptions = {
  ...DATE_SHORTCUT_OPTIONS,
  MISC_OPTIONS: DATE_SHORTCUT_OPTIONS.MISC_OPTIONS.filter(
    ({ displayName }) => displayName !== t`Exclude...`,
  ),
};

export const SearchFilterDatePicker = ({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) => {
  const [filter, onFilterChange] = useState(
    dateParameterValueToMBQL(value) ?? [],
  );

  const onCommit = (filterToCommit: any[]) => {
    onChange(filterToUrlEncoded(filterToCommit));
  };

  return (
    <DatePicker
      filter={filter}
      onCommit={onCommit}
      onFilterChange={f => onFilterChange(f)}
      dateShortcutOptions={CREATED_AT_SHORTCUTS}
    >
      <SearchFilterApplyButton onApply={() => onCommit(filter)} />
    </DatePicker>
  );
};

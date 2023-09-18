/* eslint-disable react/prop-types */
import {useState} from "react";
import type {SearchSidebarFilterComponent} from "metabase/search/types";
import {
  filterToUrlEncoded,
} from "metabase/parameters/utils/date-formatting";
import DatePicker, {
  DATE_OPERATORS,
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import {
  DATE_SHORTCUT_OPTIONS
} from "metabase/query_builder/components/filters/pickers/DatePicker/DatePickerShortcutOptions";
import {dateParameterValueToMBQL} from "metabase-lib/parameters/utils/mbql";

const CREATED_AT_FILTERS = DATE_OPERATORS.filter(
  ({name}) => name !== "exclude",
);

const CREATED_AT_DATE_SHORTCUT_OPTIONS = {
  ...DATE_SHORTCUT_OPTIONS,
  MISC_OPTIONS: DATE_SHORTCUT_OPTIONS.MISC_OPTIONS.filter(
    ({displayName}) => displayName !== "Exclude...",
  ),
};

export const CreatedAtContent: SearchSidebarFilterComponent<"created_at">["ContentComponent"] = (
  {
    value,
    onChange
  }
) => {

  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, null) || [] : [],
  );


  const onFilterChange = (filter: any[]) => {
    console.log("onFilterChange", filter)
    const encodedFilter = filterToUrlEncoded(filter);
    if (encodedFilter) {
      onChange([encodedFilter]);
    }
    setFilter(filter);
  };

  const onCommit = (filter: any[]) => {
    console.log("onCommit", filter)
    onFilterChange(filter);
  };

  return (
    <DatePicker
      filter={filter}
      onCommit={onCommit}
      onFilterChange={onFilterChange}
      operators={CREATED_AT_FILTERS}
      dateShortcutOptions={CREATED_AT_DATE_SHORTCUT_OPTIONS}
    />
  )
}

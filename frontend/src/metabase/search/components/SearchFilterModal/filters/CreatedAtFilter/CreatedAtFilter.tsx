/* eslint-disable react/prop-types */
import { useState } from "react";
import { SearchFilterComponent } from "metabase/search/types";
import DatePicker from "metabase/query_builder/components/filters/pickers/DatePicker/DatePicker";
import { dateParameterValueToMBQL } from "metabase-lib/parameters/utils/mbql";

export const CreatedAtFilter: SearchFilterComponent<"created_at"> = ({
  value = [],
  onChange,
}) => {
  const [filter, setFilter] = useState(
    value != null ? dateParameterValueToMBQL(value, null) || [] : [],
  );
  const onChangeThings = (test, hello) => {
    console.log(test, hello);
  };

  return (
    <DatePicker
      filter={filter}
      onFilterChange={x => onChangeThings("change", x)}
      onCommit={x => onChangeThings("commit", x)}
    />
  );
};

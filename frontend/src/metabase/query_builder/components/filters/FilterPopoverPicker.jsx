import React from "react";

import DatePicker, { getOperator } from "../filters/pickers/DatePicker";
import TimePicker from "../filters/pickers/TimePicker";
import DefaultPicker from "../filters/pickers/DefaultPicker";

export default function FilterPopoverPicker({
  filter,
  onFilterChange,
  onCommit,
}) {
  const setValue = (index: number, value: any) => {
    onFilterChange(filter.setArgument(index, value));
  };
  const setValues = (values: any[]) => {
    onFilterChange(filter.setArguments(values));
  };

  const dimension = filter.dimension();
  const field = dimension.field();
  return field.isTime() ? (
    <TimePicker
      className="mt1"
      filter={filter}
      onFilterChange={onFilterChange}
    />
  ) : field.isDate() ? (
    <DatePicker
      className="mt1"
      filter={filter}
      onFilterChange={onFilterChange}
    />
  ) : (
    <DefaultPicker
      filter={filter}
      setValue={setValue}
      setValues={setValues}
      onCommit={onCommit}
    />
  );
}

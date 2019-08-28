import React from "react";

import DatePicker from "../filters/pickers/DatePicker";
import TimePicker from "../filters/pickers/TimePicker";
import DefaultPicker from "../filters/pickers/DefaultPicker";

export default function FilterPopoverPicker({
  className,
  filter,
  onFilterChange,
  onCommit,
  isSidebar,
  minWidth,
  maxWidth,
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
      className={className}
      filter={filter}
      onFilterChange={onFilterChange}
      minWidth={minWidth}
      maxWidth={maxWidth}
      isSidebar={isSidebar}
    />
  ) : field.isDate() ? (
    <DatePicker
      className={className}
      filter={filter}
      onFilterChange={onFilterChange}
      minWidth={minWidth}
      maxWidth={maxWidth}
      isSidebar={isSidebar}
    />
  ) : (
    <DefaultPicker
      className={className}
      filter={filter}
      setValue={setValue}
      setValues={setValues}
      onCommit={onCommit}
      minWidth={minWidth}
      maxWidth={maxWidth}
      isSidebar={isSidebar}
    />
  );
}

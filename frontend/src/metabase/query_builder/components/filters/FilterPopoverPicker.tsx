import React from "react";
import PropTypes from "prop-types";

import DatePicker from "../filters/pickers/DatePicker";
import TimePicker from "../filters/pickers/TimePicker";
import BooleanPicker from "../filters/pickers/BooleanPicker";
import DefaultPicker from "../filters/pickers/DefaultPicker";
import Filter from "metabase-lib/lib/queries/structured/Filter";

type Props = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit: (filter: any[]) => void;
  isSidebar?: boolean;
  minWidth?: number | null;
  maxWidth?: number | null;
  primaryColor?: string;
  isNew?: boolean;
};

export default class FilterPopoverPicker extends React.Component<Props> {
  UNSAFE_componentWillMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.props.onCommit(this.props.filter);
    }
  };

  render() {
    const {
      className,
      filter,
      onFilterChange,
      onCommit,
      isSidebar,
      minWidth,
      maxWidth,
      isNew,
      primaryColor,
    } = this.props;

    const setValue = (index: number, value: any) => {
      onFilterChange(filter.setArgument(index, value));
    };

    const setValues = (values: any[]) => {
      onFilterChange(filter.setArguments(values));
    };

    const dimension = filter.dimension();
    const field = dimension?.field();

    return field?.isTime() ? (
      <TimePicker
        className={className}
        filter={filter}
        onFilterChange={onFilterChange}
        minWidth={minWidth}
        maxWidth={maxWidth}
        isSidebar={isSidebar}
      />
    ) : field?.isDate() ? (
      <DatePicker
        className={className}
        filter={filter}
        primaryColor={primaryColor}
        onFilterChange={onFilterChange}
        onCommit={onCommit}
        minWidth={minWidth}
        maxWidth={maxWidth}
        isSidebar={isSidebar}
        isNew={isNew}
      />
    ) : field?.isBoolean() ? (
      <BooleanPicker
        className={className}
        filter={filter}
        onFilterChange={onFilterChange}
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
}

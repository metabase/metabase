import React from "react";
import PropTypes from "prop-types";

import DatePicker from "../filters/pickers/DatePicker";
import TimePicker from "../filters/pickers/TimePicker";
import DefaultPicker from "../filters/pickers/DefaultPicker";

export default class FilterPopoverPicker extends React.Component {
  UNSAFE_componentWillMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.props.onCommit();
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
    } = this.props;

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
}

FilterPopoverPicker.propTypes = {
  className: PropTypes.string,
  filter: PropTypes.object,
  onFilterChange: PropTypes.func,
  onCommit: PropTypes.func,
  isSidebar: PropTypes.bool,
  minWidth: PropTypes.number,
  maxWidth: PropTypes.number,
};

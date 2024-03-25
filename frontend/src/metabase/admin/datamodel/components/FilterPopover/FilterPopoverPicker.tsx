import { Component } from "react";

import type Filter from "metabase-lib/v1/queries/structured/Filter";

import BooleanPicker from "../filters/pickers/BooleanPicker";
import { DefaultPicker } from "../filters/pickers/DefaultPicker";
import TimePicker from "../filters/pickers/TimePicker";

type Props = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  onCommit: (filter: any[]) => void;

  minWidth?: number | null;
  maxWidth?: number | null;
  primaryColor?: string;
  checkedColor?: string;
};

export class FilterPopoverPicker extends Component<Props> {
  UNSAFE_componentWillMount() {
    window.addEventListener("keydown", this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      this.props.filter.isValid() && this.props.onCommit(this.props.filter);
    }
  };

  render() {
    const {
      className,
      filter,
      onFilterChange,
      onCommit,
      minWidth,
      maxWidth,
      checkedColor,
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
        checkedColor={checkedColor}
      />
    );
  }
}

import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { Select, type SelectProps } from "metabase/ui";

const YEARS = _.range(new Date().getFullYear(), 1900, -1);

export type YearPickerProps = {
  value: number;
  onChange: (v: number) => void;
} & Omit<SelectProps, "value" | "onChange" | "data">;

const YearPicker = ({ value, onChange, ...selectProps }: YearPickerProps) => (
  <Select
    className={CS.borderless}
    {...selectProps}
    data={YEARS.map(year => String(year))}
    value={String(value)}
    onChange={year => year && onChange(parseInt(year, 10))}
    w="6rem"
    classNames={{
      dropdown: CS.ParameterDropdownWidth,
    }}
    data-testid="select-year-picker"
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default YearPicker;

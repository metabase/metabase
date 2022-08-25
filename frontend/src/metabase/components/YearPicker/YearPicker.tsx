import React, { ChangeEvent } from "react";

import Select from "metabase/core/components/Select";
import _ from "underscore";

const YEARS = _.range(new Date().getFullYear(), 1900, -1);

export interface YearPickerProps {
  value: number;
  onChange: (v: number) => void;
}

const YearPicker = ({ value, onChange }: YearPickerProps) => (
  <Select
    className="borderless"
    value={value}
    options={YEARS}
    optionNameFn={(option: any) => option}
    optionValueFn={(option: any) => option}
    onChange={({ target: { value } }: ChangeEvent<HTMLInputElement>) =>
      onChange(parseInt(value as string, 10))
    }
  />
);

export default YearPicker;

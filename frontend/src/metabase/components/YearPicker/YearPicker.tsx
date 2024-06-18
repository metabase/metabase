import type { ChangeEvent } from "react";
import _ from "underscore";

import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";

const YEARS = _.range(new Date().getFullYear(), 1900, -1);

export interface YearPickerProps {
  value: number;
  onChange: (v: number) => void;
}

const YearPicker = ({ value, onChange }: YearPickerProps) => (
  <Select
    className={CS.borderless}
    value={value}
    options={YEARS}
    optionNameFn={(option: any) => option}
    optionValueFn={(option: any) => option}
    onChange={({ target: { value } }: ChangeEvent<HTMLInputElement>) =>
      onChange(parseInt(value as string, 10))
    }
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default YearPicker;

import { t } from "ttag";

import type { FilterOperatorOption } from "metabase/querying/filters/types";
import { Select } from "metabase/ui";
import type * as Lib from "metabase-lib";

import S from "./FilterOperatorPicker.module.css";

interface FilterOperatorPickerProps<T extends Lib.FilterOperator> {
  value: T;
  options: FilterOperatorOption<T>[];
  onChange: (operator: T) => void;
}

export function FilterOperatorPicker<T extends Lib.FilterOperator>({
  value,
  options,
  onChange,
}: FilterOperatorPickerProps<T>) {
  const data = options.map((option) => ({
    value: option.operator,
    label: option.displayName,
  }));

  return (
    <Select
      data={data}
      value={value}
      size="xs"
      aria-label={t`Filter operator`}
      classNames={{ input: S.input }}
      // Same as DateOperatorPicker: a portaled dropdown is outside the filter
      // popover, so a click on an option would close the popover.
      comboboxProps={{ withinPortal: false, floatingStrategy: "fixed" }}
      onChange={onChange}
    />
  );
}

import { t } from "ttag";

import { MultiSelect } from "metabase/ui";

import {
  type BreakdownColumn,
  type BreakdownOption,
  MAX_BREAKDOWN_COLUMNS,
  getBreakdownOptionValue,
} from "../../analyses/breakdown";
import type { SettingWidgetProps } from "../../settings/types";

type BreakdownWidgetProps = SettingWidgetProps<BreakdownColumn[]> & {
  options: BreakdownOption[];
};

export const BreakdownWidget = ({
  id,
  value,
  onChange,
  options,
}: BreakdownWidgetProps) => {
  const handleChange = (values: string[]) =>
    onChange(
      values.flatMap(
        (optionValue) =>
          options.find((option) => option.value === optionValue)?.breakdown ??
          [],
      ),
    );

  return (
    <MultiSelect
      id={id}
      data={options.map(({ value, label }) => ({ value, label }))}
      value={value.map(getBreakdownOptionValue)}
      maxValues={MAX_BREAKDOWN_COLUMNS}
      placeholder={value.length === 0 ? t`Don't break down` : undefined}
      searchable
      onChange={handleChange}
    />
  );
};

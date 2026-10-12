import { t } from "ttag";

import { Select } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";

type ColumnPickerWidgetProps = SettingWidgetProps<string | null> & {
  columns?: { value: string; label: string }[];
  isRequired?: boolean;
};

export const ColumnPickerWidget = ({
  id,
  value,
  onChange,
  columns = [],
  isRequired = false,
}: ColumnPickerWidgetProps) => (
  <Select
    id={id}
    data={columns}
    value={value}
    placeholder={isRequired ? t`Pick a column` : t`None`}
    clearable={!isRequired}
    allowDeselect={!isRequired}
    searchable
    onChange={onChange}
  />
);

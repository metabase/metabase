import { t } from "ttag";

import {
  FILTER_POPOVER_COMBOBOX,
  FilterSection,
} from "metabase/common/components/ListFilterPopover";
import {
  type MonitorTimePreset,
  getTimePresetOptions,
  toTimePreset,
} from "metabase/monitor/time-presets";
import { Select } from "metabase/ui";

type TimePresetFilterProps = {
  label: string;
  value: MonitorTimePreset | null;
  placeholder?: string;
  onChange: (preset: MonitorTimePreset | null) => void;
};

export const TimePresetFilter = ({
  label,
  value,
  placeholder = t`Any time`,
  onChange,
}: TimePresetFilterProps) => (
  <FilterSection label={label}>
    <Select
      w="100%"
      data={getTimePresetOptions()}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      clearable
      comboboxProps={FILTER_POPOVER_COMBOBOX}
      onChange={(next) => onChange(toTimePreset(next))}
    />
  </FilterSection>
);

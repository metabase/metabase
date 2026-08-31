import { Switch } from "metabase/ui";
import type { ChartSettingEnumToggleProps } from "metabase/viz-core";

export const ChartSettingEnumToggle = <T extends string>({
  value,
  onChange,
  id,
  checkedValue,
  uncheckedValue,
}: ChartSettingEnumToggleProps<T>) => (
  <Switch
    labelPosition="left"
    checked={value === checkedValue}
    onChange={(e) =>
      onChange(e.currentTarget.checked ? checkedValue : uncheckedValue)
    }
    id={id}
    role="switch"
    size="sm"
  />
);

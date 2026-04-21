import { Switch } from "metabase/ui";

export type ChartSettingEnumToggleProps<T extends string> = {
  value: T | undefined;
  onChange: (value: T) => void;
  id?: string;
  checkedValue: T;
  uncheckedValue: T;
};

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

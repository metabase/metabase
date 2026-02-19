import { Switch } from "metabase/ui";

export const ChartSettingEnumToggle = <T extends string>({
  value,
  onChange,
  id,
  checkedValue,
  uncheckedValue,
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  id?: string;
  checkedValue: T;
  uncheckedValue: T;
}) => (
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

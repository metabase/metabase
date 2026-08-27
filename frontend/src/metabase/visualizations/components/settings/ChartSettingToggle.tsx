import { Switch } from "metabase/ui";

export const ChartSettingToggle = ({
  value,
  onChange,
  id,
  disabled,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  id?: string;
  disabled?: boolean;
}) => (
  <Switch
    labelPosition="left"
    checked={value ?? false}
    onChange={(e) => onChange(e.currentTarget.checked)}
    id={id}
    role="switch"
    size="sm"
    disabled={disabled}
  />
);

import { Switch } from "metabase/ui";

export const ChartSettingToggle = ({
  value,
  onChange,
  id,
  disabled,
  readOnly,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  id?: string;
  disabled?: boolean;
  readOnly?: boolean;
}) => (
  <Switch
    labelPosition="left"
    checked={value ?? false}
    onChange={(e) => onChange(e.currentTarget.checked)}
    id={id}
    role="switch"
    disabled={disabled || readOnly}
  />
);

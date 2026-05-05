import { Switch } from "metabase/ui";

export const ChartSettingToggle = ({
  value,
  onChange,
  id,
}: {
  value: boolean | undefined;
  onChange: (value: boolean) => void;
  id?: string;
}) => (
  <Switch
    labelPosition="left"
    checked={value ?? false}
    onChange={(e) => onChange(e.currentTarget.checked)}
    id={id}
    role="switch"
    size="sm"
  />
);

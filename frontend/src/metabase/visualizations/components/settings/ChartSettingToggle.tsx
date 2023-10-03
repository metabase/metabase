import { Switch } from "metabase/ui";

interface ChartSettingToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  id: string;
}

export const ChartSettingToggle = ({
  value,
  onChange,
  id,
}: ChartSettingToggleProps) => (
  <Switch
    checked={value}
    onChange={e => onChange(e.currentTarget.checked)}
    id={id}
  />
);

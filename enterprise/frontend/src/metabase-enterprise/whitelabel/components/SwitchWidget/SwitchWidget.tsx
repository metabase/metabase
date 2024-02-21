import type { SwitchProps } from "metabase/ui";
import { Switch } from "metabase/ui";

interface MetabaseBooleanSetting {
  value: boolean | null;
  default: boolean;
}

type SwitchWidgetProps = SwitchProps & {
  setting: MetabaseBooleanSetting;
  onChange: (value: boolean) => void;
};

export function SwitchWidget({
  setting,
  onChange,
  ...props
}: SwitchWidgetProps) {
  return (
    <Switch
      checked={setting.value ?? setting.default}
      onChange={e => onChange(e.target.checked)}
      size="sm"
      {...props}
    />
  );
}

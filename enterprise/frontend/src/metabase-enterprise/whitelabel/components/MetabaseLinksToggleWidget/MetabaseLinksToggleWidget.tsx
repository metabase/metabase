import { t } from "ttag";

import { Switch } from "metabase/ui";

interface MetabaseLinksToggleSetting {
  value: boolean | null;
  default: boolean;
}

interface MetabaseLinksToggleWidgetProps {
  setting: MetabaseLinksToggleSetting;
  onChange: (value: boolean) => void;
}

export function MetabaseLinksToggleWidget({
  setting,
  onChange,
}: MetabaseLinksToggleWidgetProps) {
  return (
    <Switch
      checked={setting.value ?? setting.default}
      onChange={e => onChange(e.target.checked)}
      labelPosition="left"
      label={t`Show links and references`}
      size="sm"
    />
  );
}

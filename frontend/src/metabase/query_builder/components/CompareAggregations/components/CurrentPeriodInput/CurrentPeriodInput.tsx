import { useCallback } from "react";
import { t } from "ttag";

import { Switch } from "metabase/ui";

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
};

export function CurrentPeriodInput({ value, onChange }: Props) {
  const handleChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      onChange(evt.target.checked);
    },
    [onChange],
  );

  return (
    <Switch
      checked={value}
      onChange={handleChange}
      label={t`Include current period`}
      size="xs"
    />
  );
}

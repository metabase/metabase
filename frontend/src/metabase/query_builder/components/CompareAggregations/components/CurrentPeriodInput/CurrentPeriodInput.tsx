import { useCallback } from "react";
import { t } from "ttag";

import { Switch } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  bucket: TemporalUnit | null;
};

export function CurrentPeriodInput({ value, onChange, bucket }: Props) {
  const handleChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      onChange(evt.target.checked);
    },
    [onChange],
  );

  if (!bucket) {
    return null;
  }

  return (
    <Switch
      checked={value}
      onChange={handleChange}
      label={t`Include this ${bucket ?? "period"}`}
      size="xs"
    />
  );
}

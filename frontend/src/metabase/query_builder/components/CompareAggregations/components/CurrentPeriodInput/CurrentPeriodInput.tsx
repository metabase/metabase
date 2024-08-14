import { useCallback } from "react";
import { t } from "ttag";

import { Checkbox } from "metabase/ui";

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
};

export function CurrentPerionInput({ value, onChange }: Props) {
  const handleChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      onChange(evt.target.checked);
    },
    [onChange],
  );

  return (
    <Checkbox
      checked={value}
      onChange={handleChange}
      label={t`Include current period`}
    />
  );
}

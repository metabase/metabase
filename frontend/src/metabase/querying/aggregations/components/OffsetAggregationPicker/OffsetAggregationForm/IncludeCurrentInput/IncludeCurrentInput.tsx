import type { ChangeEvent } from "react";

import { Switch } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

import { getIncludeCurrentLabel } from "../../utils";

type IncludeCurrentInputProps = {
  offsetUnit: TemporalUnit;
  includeCurrent: boolean;
  onIncludeCurrentChange: (includeCurrent: boolean) => void;
};

export function IncludeCurrentInput({
  offsetUnit,
  includeCurrent,
  onIncludeCurrentChange,
}: IncludeCurrentInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onIncludeCurrentChange(event.target.checked);
  };

  return (
    <Switch
      checked={includeCurrent}
      label={getIncludeCurrentLabel(offsetUnit)}
      size="xs"
      onChange={handleChange}
    />
  );
}

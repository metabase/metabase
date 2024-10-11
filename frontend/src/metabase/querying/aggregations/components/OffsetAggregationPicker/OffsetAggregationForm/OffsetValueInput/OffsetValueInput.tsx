import { t } from "ttag";

import { NumberInput } from "metabase/ui";

import type { ComparisonType } from "../../types";

interface OffsetValueInputProps {
  comparisonType: ComparisonType;
  offsetValue: number;
  onOffsetValueChange: (offsetValue: number) => void;
}

export const OffsetValueInput = ({
  comparisonType,
  offsetValue,
  onOffsetValueChange,
}: OffsetValueInputProps) => {
  const minimum = comparisonType === "offset" ? 1 : 2;

  const handleChange = (value: number | "") => {
    if (typeof value === "number") {
      onOffsetValueChange(Math.floor(Math.max(Math.abs(value), minimum)));
    }
  };

  return (
    <NumberInput
      type="number"
      value={offsetValue}
      min={minimum}
      step={1}
      precision={0}
      aria-label={t`Offset`}
      onChange={handleChange}
    />
  );
};

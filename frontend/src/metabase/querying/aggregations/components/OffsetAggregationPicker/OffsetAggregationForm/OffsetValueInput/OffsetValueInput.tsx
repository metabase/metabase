import { t } from "ttag";

import { NumberInput } from "metabase/ui";

import type { ComparisonType } from "../../types";
import { getOffsetValueMin } from "../../utils";

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
  const min = getOffsetValueMin(comparisonType);

  const handleChange = (value: number | "") => {
    if (typeof value === "number") {
      onOffsetValueChange(value);
    }
  };

  return (
    <NumberInput
      type="number"
      value={offsetValue}
      min={min}
      step={1}
      precision={0}
      w="3.5rem"
      aria-label={t`Offset`}
      onChange={handleChange}
    />
  );
};

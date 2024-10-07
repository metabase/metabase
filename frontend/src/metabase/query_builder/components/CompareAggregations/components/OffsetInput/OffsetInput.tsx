import { useCallback } from "react";
import { t } from "ttag";

import { NumberInput } from "metabase/ui";

import type { ComparisonType } from "../../types";

import S from "./OffsetInput.module.css";

interface Props {
  value: number | "";
  onChange: (value: number | "") => void;
  comparisonType: ComparisonType;
}

export const OffsetInput = ({ value, onChange, comparisonType }: Props) => {
  const minimum = comparisonType === "offset" ? 1 : 2;

  const handleChange = useCallback(
    (value: number | "") => {
      if (typeof value === "number") {
        onChange(Math.floor(Math.max(Math.abs(value), minimum)));
      } else {
        onChange(value);
      }
    },
    [onChange, minimum],
  );

  return (
    <NumberInput
      classNames={{ input: S.input }}
      min={minimum}
      precision={0}
      size="md"
      step={1}
      type="number"
      value={value}
      onChange={handleChange}
      aria-label={t`Offset`}
    />
  );
};

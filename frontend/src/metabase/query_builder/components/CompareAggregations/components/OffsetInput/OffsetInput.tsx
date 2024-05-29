import { t } from "ttag";

import { NumberInput } from "metabase/ui";

interface Props {
  value: number | "";
  onChange: (value: number | "") => void;
}
export const OffsetInput = ({ value, onChange }: Props) => {
  return (
    <NumberInput
      label={getPeriodTitle()}
      min={1}
      parseValue={parsePeriodValue}
      precision={0}
      size="md"
      step={1}
      type="number"
      value={value}
      onChange={onChange}
    />
  );
};

const parsePeriodValue = (value: string): number | "" => {
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? "" : Math.max(Math.abs(number), 1);
};

const getPeriodTitle = (): string => {
  // TODO: implement me
  return t`Previous period`;
};

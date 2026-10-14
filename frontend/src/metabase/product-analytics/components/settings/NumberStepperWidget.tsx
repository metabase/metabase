import { NumberInput } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";

type NumberStepperWidgetProps = SettingWidgetProps<number> & {
  min?: number;
  max?: number;
};

/** A whole number with stepper controls. Ignores values outside the range. */
export const NumberStepperWidget = ({
  id,
  value,
  onChange,
  min = 1,
  max,
}: NumberStepperWidgetProps) => (
  <NumberInput
    id={id}
    w="8rem"
    min={min}
    max={max}
    allowDecimal={false}
    allowNegative={min < 0}
    hideControls={false}
    value={value}
    onChange={(newValue) => {
      if (
        typeof newValue === "number" &&
        newValue >= min &&
        (max === undefined || newValue <= max)
      ) {
        onChange(newValue);
      }
    }}
  />
);

import { NumberInput } from "metabase/ui";

import type { SettingWidgetProps } from "../../settings/types";

type NumberStepperWidgetProps = SettingWidgetProps<number> & {
  min?: number;
  max?: number;
  "aria-label"?: string;
};

/** A whole number with stepper controls. Ignores values outside the range. */
export const NumberStepperWidget = ({
  id,
  value,
  onChange,
  min = 1,
  max,
  "aria-label": ariaLabel,
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
    aria-label={ariaLabel}
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

import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import ColorInput from "metabase/core/components/ColorInput";
import { ColorPill } from "metabase/core/components/ColorPill";
import { Group } from "metabase/ui";

export interface ColorPickerTriggerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (value?: string) => void;
}

const ColorPickerTrigger = forwardRef(function ColorPickerTrigger(
  {
    value,
    placeholder,
    isAuto,
    onClick,
    onChange,
    ...props
  }: ColorPickerTriggerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Group {...props} ref={ref} wrap="nowrap">
      <ColorPill color={value} isAuto={isAuto} onClick={onClick} />
      <ColorInput
        value={!isAuto ? value : undefined}
        placeholder={placeholder}
        fullWidth
        onChange={onChange}
      />
    </Group>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerTrigger;

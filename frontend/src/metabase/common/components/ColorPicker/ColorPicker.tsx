import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";

import ColorPickerContent from "./ColorPickerContent";
import ColorPickerTrigger from "./ColorPickerTrigger";

export type ColorPickerAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerProps extends ColorPickerAttributes {
  value: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (color?: string) => void;
}

const ColorPicker = forwardRef(function ColorPicker(
  { value, placeholder, isAuto, onChange, ...props }: ColorPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      disableContentSandbox
      renderTrigger={({ onClick }) => (
        <ColorPickerTrigger
          {...props}
          ref={ref}
          value={value}
          placeholder={placeholder}
          isAuto={isAuto}
          onClick={onClick}
          onChange={onChange}
        />
      )}
      popoverContent={<ColorPickerContent value={value} onChange={onChange} />}
    />
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPicker;

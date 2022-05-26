import React, { forwardRef, HTMLAttributes, Ref } from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorPickerTrigger from "./ColorPickerTrigger";
import ColorPickerContent from "./ColorPickerContent";

export type ColorPickerAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerProps extends ColorPickerAttributes {
  color: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (color?: string) => void;
}

const ColorPicker = forwardRef(function ColorPicker(
  { color, placeholder, isAuto, onChange, ...props }: ColorPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      disableContentSandbox
      renderTrigger={({ onClick }) => (
        <ColorPickerTrigger
          {...props}
          ref={ref}
          color={color}
          placeholder={placeholder}
          isAuto={isAuto}
          onClick={onClick}
          onChange={onChange}
        />
      )}
      popoverContent={<ColorPickerContent color={color} onChange={onChange} />}
    />
  );
});

export default ColorPicker;

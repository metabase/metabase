import React from "react";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import ColorPickerTrigger from "./ColorPickerTrigger";
import ColorPickerContent from "./ColorPickerContent";

export interface ColorPickerProps {
  color: string;
  placeholder?: string;
  isBordered?: boolean;
  isSelected?: boolean;
  isGenerated?: boolean;
  onChange?: (color: string) => void;
}

const ColorPicker = ({
  color,
  placeholder,
  isBordered,
  isSelected,
  isGenerated,
  onChange,
}: ColorPickerProps): JSX.Element => {
  return (
    <TippyPopoverWithTrigger
      disableContentSandbox
      renderTrigger={({ onClick }) => (
        <ColorPickerTrigger
          color={color}
          placeholder={placeholder}
          isBordered={isBordered}
          isSelected={isSelected}
          isGenerated={isGenerated}
          onClick={onClick}
          onChange={onChange}
        />
      )}
      popoverContent={<ColorPickerContent color={color} onChange={onChange} />}
    />
  );
};

export default ColorPicker;

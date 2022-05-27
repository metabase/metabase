import React, { forwardRef, HTMLAttributes, Ref, useCallback } from "react";
import { ColorState } from "react-color";
import ColorInput from "metabase/core/components/ColorInput";
import ColorPickerControls from "./ColorPickerControls";
import { ContentContainer } from "./ColorPicker.styled";

export type ColorPickerContentAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerContentProps extends ColorPickerContentAttributes {
  color?: string;
  onChange?: (color?: string) => void;
}

const ColorPickerContent = forwardRef(function ColorPickerContent(
  { color, onChange, ...props }: ColorPickerContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (state: ColorState) => onChange?.(state.hex),
    [onChange],
  );

  return (
    <ContentContainer {...props} ref={ref}>
      <ColorPickerControls color={color} onChange={handleChange} />
      <ColorInput color={color} fullWidth onChange={onChange} />
    </ContentContainer>
  );
});

export default ColorPickerContent;

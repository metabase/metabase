import React, { useCallback } from "react";
import { ColorState } from "react-color";
import ColorPickerControls from "./ColorPickerControls";
import { ContentContainer } from "./ColorPicker.styled";

export interface ColorPickerContentProps {
  color?: string;
  onChange?: (color: string) => void;
}

const ColorPickerContent = ({
  color,
  onChange,
}: ColorPickerContentProps): JSX.Element => {
  const handleChange = useCallback(
    (state: ColorState) => onChange?.(state.hex),
    [onChange],
  );

  return (
    <ContentContainer>
      <ColorPickerControls color={color} onChange={handleChange} />
    </ContentContainer>
  );
};

export default ColorPickerContent;

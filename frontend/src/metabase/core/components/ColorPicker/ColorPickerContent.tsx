import React, { useCallback } from "react";
import { ColorState } from "react-color";
import ColorInput from "metabase/core/components/ColorInput";
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
  const handleInputChange = useCallback(
    (color?: string) => color && onChange?.(color),
    [onChange],
  );

  const handleControlsChange = useCallback(
    (state: ColorState) => onChange?.(state.hex),
    [onChange],
  );

  return (
    <ContentContainer>
      <ColorPickerControls color={color} onChange={handleControlsChange} />
      <ColorInput color={color} fullWidth onChange={handleInputChange} />
    </ContentContainer>
  );
};

export default ColorPickerContent;

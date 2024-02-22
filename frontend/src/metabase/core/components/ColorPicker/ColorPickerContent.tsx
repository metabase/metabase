import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";
import type { ColorState } from "react-color";

import ColorInput from "metabase/core/components/ColorInput";

import { ContentContainer } from "./ColorPicker.styled";
import ColorPickerControls from "./ColorPickerControls";

export type ColorPickerContentAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerContentProps extends ColorPickerContentAttributes {
  value?: string;
  onChange?: (value?: string) => void;
}

const ColorPickerContent = forwardRef(function ColorPickerContent(
  { value, onChange, ...props }: ColorPickerContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (state: ColorState) => onChange?.(state.hex),
    [onChange],
  );

  return (
    <ContentContainer {...props} ref={ref}>
      <ColorPickerControls color={value} onChange={handleChange} />
      <ColorInput value={value} fullWidth onChange={onChange} />
    </ContentContainer>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPickerContent;

import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";

import ColorInput from "metabase/common/components/ColorInput";

import { ContentContainer } from "./ColorPicker.styled";
import { ColorPickerControls } from "./ColorPickerControls";

export type ColorPickerContentAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerContentProps extends ColorPickerContentAttributes {
  value: string;
  onChange: (value: string | undefined) => void;
}

const ColorPickerContent = forwardRef(function ColorPickerContent(
  { value, onChange, ...props }: ColorPickerContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (color: string) => onChange?.(color),
    [onChange],
  );

  return (
    <ContentContainer {...props} ref={ref}>
      <ColorPickerControls color={value} onChange={handleChange} />
      <ColorInput value={value} fullWidth onChange={onChange} />
    </ContentContainer>
  );
});

export { ColorPickerContent };

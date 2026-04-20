import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useCallback } from "react";
import type { ColorState } from "react-color";

import { ColorInput } from "metabase/common/components/ColorInput";

import { ContentContainer } from "./ColorPicker.styled";
import { ColorPickerControls } from "./ColorPickerControls";

export type ColorPickerContentAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerContentProps extends ColorPickerContentAttributes {
  value?: string;
  showAlpha?: boolean;
  onChange?: (value?: string) => void;
}

export const ColorPickerContent = forwardRef(function ColorPickerContent(
  { value, showAlpha, onChange, ...props }: ColorPickerContentProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleChange = useCallback(
    (state: ColorState) => {
      const alpha = state.rgb.a ?? 1;
      if (showAlpha && alpha < 1) {
        const alphaHex = Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0");
        onChange?.(`${state.hex}${alphaHex}`);
      } else {
        onChange?.(state.hex);
      }
    },
    [onChange, showAlpha],
  );

  return (
    <ContentContainer {...props} ref={ref}>
      <ColorPickerControls
        color={value}
        onChange={handleChange}
        showAlpha={showAlpha}
      />
      <ColorInput value={value} fullWidth onChange={onChange} />
    </ContentContainer>
  );
});

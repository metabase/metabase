import { type Ref, forwardRef } from "react";

import TippyPopoverWithTrigger from "metabase/common/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Group } from "metabase/ui";

import { ColorPill } from "../ColorPill";

import type { ColorPickerAttributes } from "./ColorPicker";
import ColorPickerContent from "./ColorPickerContent";
import S from "./ColorPillPicker.module.css";

export interface ColorPillPickerProps extends ColorPickerAttributes {
  value: string;
  placeholder?: string;
  onChange?: (color?: string) => void;
}

export const ColorPillPicker = forwardRef(function ColorPillPicker(
  { value, placeholder, onChange, ...props }: ColorPillPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <TippyPopoverWithTrigger
      disableContentSandbox
      renderTrigger={({ onClick }) => (
        <Group {...props} ref={ref} wrap="nowrap">
          <ColorPill color={value} onClick={onClick} />
        </Group>
      )}
      popoverContent={<ColorPickerContent value={value} onChange={onChange} />}
      className={S.ColorPillPicker}
    />
  );
});

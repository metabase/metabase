import { type Ref, forwardRef } from "react";

import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import type { ColorPickerAttributes } from "metabase/core/components/ColorPicker/ColorPicker";
import ColorPickerContent from "metabase/core/components/ColorPicker/ColorPickerContent";
import { ColorPill } from "metabase/core/components/ColorPill";
import { Group } from "metabase/ui";

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
    />
  );
});

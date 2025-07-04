import { useDebouncedCallback } from "@mantine/hooks";
import { type Ref, forwardRef, useState } from "react";

import TippyPopoverWithTrigger from "metabase/common/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Group } from "metabase/ui";

import { ColorPill } from "../ColorPill";

import type { ColorPickerAttributes } from "./ColorPicker";
import ColorPickerContent from "./ColorPickerContent";
import S from "./ColorPillPicker.module.css";

export interface ColorPillPickerProps extends ColorPickerAttributes {
  initialValue: string;
  debounceMs?: number;
  placeholder?: string;
  onChange: (color?: string) => void;
}

const COLOR_PICKER_DEBOUNCE_MS = 300;

export const ColorPillPicker = forwardRef(function ColorPillPicker(
  {
    initialValue,
    placeholder,
    onChange,
    debounceMs = COLOR_PICKER_DEBOUNCE_MS,
    ...props
  }: ColorPillPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [previewValue, setPreviewValue] = useState<string>(initialValue);

  const debouncedUpdate = useDebouncedCallback(onChange, debounceMs);

  return (
    <TippyPopoverWithTrigger
      disableContentSandbox
      renderTrigger={({ onClick }) => (
        <Group {...props} ref={ref} wrap="nowrap">
          <ColorPill color={previewValue} onClick={onClick} />
        </Group>
      )}
      popoverContent={
        <ColorPickerContent
          value={previewValue}
          onChange={(value) => {
            if (!value) {
              return;
            }

            setPreviewValue(value);
            debouncedUpdate(value);
          }}
        />
      }
      className={S.ColorPillPicker}
    />
  );
});

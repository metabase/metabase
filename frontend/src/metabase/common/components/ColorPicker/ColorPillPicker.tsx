import { useDebouncedCallback } from "@mantine/hooks";
import { type Ref, forwardRef, useState } from "react";

import TippyPopoverWithTrigger from "metabase/common/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { Group } from "metabase/ui";

import { ColorPill } from "../ColorPill";

import type { ColorPickerAttributes } from "./ColorPicker";
import ColorPickerContent from "./ColorPickerContent";
import S from "./ColorPillPicker.module.css";

export interface ColorPillPickerProps extends ColorPickerAttributes {
  onChange: (color?: string) => void;

  /**
   * The original color is typically from the application settings.
   * We revert back to this color if the user clears the color input.
   **/
  originalColor: string;

  /**
   * The initial color to display in the color picker.
   * Useful if the color has been set before e.g. in user settings.
   * Defaults to the `originalColor`.
   */
  initialColor?: string;

  debounceMs?: number;
}

const COLOR_PICKER_DEBOUNCE_MS = 300;

export const ColorPillPicker = forwardRef(function ColorPillPicker(
  {
    onChange,
    debounceMs = COLOR_PICKER_DEBOUNCE_MS,
    originalColor,
    initialColor,
    ...props
  }: ColorPillPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [previewValue, setPreviewValue] = useState<string>(
    initialColor ?? originalColor,
  );

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
          onChange={(nextColor) => {
            // Fallback to the original color if the value is cleared.
            const colorWithDefault = nextColor ?? originalColor;

            setPreviewValue(colorWithDefault);
            debouncedUpdate(colorWithDefault);
          }}
        />
      }
      className={S.ColorPillPicker}
    />
  );
});

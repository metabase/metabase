import { useDebouncedCallback } from "@mantine/hooks";
import { type Ref, forwardRef, useState } from "react";

import { Group, Popover } from "metabase/ui";

import { ColorPill } from "../ColorPill";

import type { ColorPickerAttributes } from "./ColorPicker";
import { ColorPickerContent } from "./ColorPickerContent";
import S from "./ColorPillPicker.module.css";

export interface ColorPillPickerProps extends ColorPickerAttributes {
  onChange: (color?: string) => void;

  /**
   * The original color is typically from the application settings.
   * We revert back to this color if the user clears the color input.
   **/
  originalColor: string;

  /** Undebounced preview value of the color. */
  previewValue: string;

  /**
   * Callback when preview value changes.
   */
  onPreviewChange: (color: string) => void;

  debounceMs?: number;
}

const COLOR_PICKER_DEBOUNCE_MS = 300;

export const ColorPillPicker = forwardRef(function ColorPillPicker(
  {
    onChange,
    debounceMs = COLOR_PICKER_DEBOUNCE_MS,
    originalColor,
    previewValue,
    onPreviewChange,
    ...props
  }: ColorPillPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const debouncedUpdate = useDebouncedCallback(onChange, debounceMs);
  const color = previewValue ?? originalColor;
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover opened={isOpened} onChange={setIsOpened} position="bottom-start">
      <Popover.Target>
        <Group {...props} ref={ref} wrap="nowrap">
          <ColorPill color={color} onClick={() => setIsOpened(true)} />
        </Group>
      </Popover.Target>
      <Popover.Dropdown
        // TODO: remove when the legacy Modal / RENDERED_POPOVERS stack is no longer used (GDGT-2575)
        setupSequencedCloseHandler={() => setIsOpened(false)}
        className={S.ColorPillPicker}
      >
        <ColorPickerContent
          value={color}
          onChange={(nextColor) => {
            // Fallback to the original color if the value is cleared.
            const colorWithDefault = nextColor ?? originalColor;

            onPreviewChange(colorWithDefault);
            debouncedUpdate(colorWithDefault);
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
});

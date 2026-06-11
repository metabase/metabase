import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useState } from "react";

import { Popover } from "metabase/ui";

import { ColorPickerContent } from "./ColorPickerContent";
import { ColorPickerTrigger } from "./ColorPickerTrigger";

export type ColorPickerAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange"
>;

export interface ColorPickerProps extends ColorPickerAttributes {
  value: string;
  placeholder?: string;
  isAuto?: boolean;
  onChange?: (color?: string) => void;
}

export const ColorPicker = forwardRef(function ColorPicker(
  { value, placeholder, isAuto, onChange, ...props }: ColorPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [isOpened, setIsOpened] = useState(false);

  return (
    <Popover opened={isOpened} onChange={setIsOpened} position="bottom-start">
      <Popover.Target>
        <ColorPickerTrigger
          {...props}
          ref={ref}
          value={value}
          placeholder={placeholder}
          isAuto={isAuto}
          onClick={() => setIsOpened(true)}
          onChange={onChange}
        />
      </Popover.Target>
      <Popover.Dropdown setupSequencedCloseHandler={() => setIsOpened(false)}>
        <ColorPickerContent value={value} onChange={onChange} />
      </Popover.Dropdown>
    </Popover>
  );
});

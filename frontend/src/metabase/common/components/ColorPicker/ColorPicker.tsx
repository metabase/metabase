import type { HTMLAttributes, Ref } from "react";
import { forwardRef, useState } from "react";

import { Popover } from "metabase/ui";

import ColorPickerContent from "./ColorPickerContent";
import ColorPickerTrigger from "./ColorPickerTrigger";

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

const ColorPicker = forwardRef(function ColorPicker(
  { value, placeholder, isAuto, onChange, ...props }: ColorPickerProps,
  ref: Ref<HTMLDivElement>,
) {
  const [opened, setOpened] = useState(false);

  return (
    <Popover opened={opened} onChange={setOpened}>
      <Popover.Target>
        <ColorPickerTrigger
          {...props}
          ref={ref}
          value={value}
          placeholder={placeholder}
          isAuto={isAuto}
          onClick={() => setOpened(true)}
          onChange={onChange}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <ColorPickerContent value={value} onChange={onChange} />
      </Popover.Dropdown>
    </Popover>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ColorPicker;

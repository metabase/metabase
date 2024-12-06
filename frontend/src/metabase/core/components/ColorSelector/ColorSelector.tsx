import { useDisclosure } from "@mantine/hooks";
import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import type { PillSize } from "metabase/core/components/ColorPill";
import ColorPill from "metabase/core/components/ColorPill";
import { Popover } from "metabase/ui";

import ColorSelectorPopover from "./ColorSelectorPopover";

export type ColorSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
>;

export interface ColorSelectorProps extends ColorSelectorAttributes {
  value: string;
  colors: string[];
  pillSize?: PillSize;
  onChange?: (newValue: string) => void;
}

export const ColorSelector = forwardRef(function ColorSelector(
  { value, colors, onChange, ...props }: ColorSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <Popover opened={opened} onClose={close} position="bottom-end">
      <Popover.Target>
        <ColorPill {...props} ref={ref} color={value} onClick={open} />
      </Popover.Target>
      <Popover.Dropdown>
        <ColorSelectorPopover
          value={value}
          colors={colors}
          onChange={onChange}
          onClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
});

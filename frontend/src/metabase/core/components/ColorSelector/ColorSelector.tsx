import { useDisclosure } from "@mantine/hooks";
import type { HTMLAttributes } from "react";

import type { PillSize } from "metabase/core/components/ColorPill";
import { ColorPill } from "metabase/core/components/ColorPill";
import { Center, Popover } from "metabase/ui";

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
  withinPortal?: boolean;
}

export const ColorSelector = ({
  value,
  colors,
  onChange,
  withinPortal = true,
  ...props
}: ColorSelectorProps) => {
  const [opened, { toggle, close }] = useDisclosure(false);

  return (
    <Popover
      withinPortal={withinPortal}
      opened={opened}
      onClose={close}
      position="bottom-start"
    >
      <Popover.Target>
        <Center data-testid="color-selector-button">
          <ColorPill {...props} color={value} onClick={toggle} />
        </Center>
      </Popover.Target>
      <Popover.Dropdown>
        <ColorSelectorPopover
          value={value}
          colors={colors}
          onChange={onChange}
          onClose={close}
          data-testid="color-selector-popover"
        />
      </Popover.Dropdown>
    </Popover>
  );
};

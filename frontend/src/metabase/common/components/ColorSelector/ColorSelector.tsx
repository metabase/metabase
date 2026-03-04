import { useDisclosure } from "@mantine/hooks";
import type { HTMLAttributes } from "react";

import type { PillSize } from "metabase/common/components/ColorPill";
import { ColorPill } from "metabase/common/components/ColorPill";
import { Center, Popover } from "metabase/ui";

import { ColorSelectorPopover } from "./ColorSelectorPopover";

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
      floatingStrategy="fixed"
      opened={opened}
      onDismiss={close}
      position="bottom-start"
      trapFocus
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

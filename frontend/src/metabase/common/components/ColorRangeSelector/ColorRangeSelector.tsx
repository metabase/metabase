import { useDisclosure } from "@mantine/hooks";
import type { HTMLAttributes, Ref } from "react";
import { forwardRef } from "react";

import { ColorRange } from "metabase/common/components/ColorRange";
import { Popover, type PopoverProps, rem } from "metabase/ui";

import { ColorRangePopover } from "./ColorRangePopover";

export type ColorRangeSelectorAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onSelect"
> &
  Pick<PopoverProps, "withinPortal">;

export interface ColorRangeSelectorProps extends ColorRangeSelectorAttributes {
  value: string[];
  colors: string[];
  colorRanges?: string[][];
  colorMapping?: Record<string, string[]>;
  isQuantile?: boolean;
  onChange?: (newValue: string[]) => void;
}

export const ColorRangeSelector = forwardRef(function ColorRangeSelector(
  {
    value,
    colors,
    colorRanges,
    colorMapping,
    isQuantile,
    onChange,
    withinPortal,
    ...props
  }: ColorRangeSelectorProps,
  ref: Ref<HTMLDivElement>,
) {
  const [opened, { close, toggle }] = useDisclosure(false);
  return (
    <Popover
      opened={opened}
      onChange={toggle}
      floatingStrategy="fixed"
      withinPortal={withinPortal}
      position="bottom-start"
    >
      <Popover.Target>
        <ColorRange
          {...props}
          ref={ref}
          colors={value}
          isQuantile={isQuantile}
          onClick={toggle}
          role="button"
        />
      </Popover.Target>
      <Popover.Dropdown>
        <ColorRangePopover
          maw={rem(360)}
          initialValue={value}
          colors={colors}
          colorRanges={colorRanges}
          colorMapping={colorMapping}
          isQuantile={isQuantile}
          onChange={onChange}
          onClose={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
});

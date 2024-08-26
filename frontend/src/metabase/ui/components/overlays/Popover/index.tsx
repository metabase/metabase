import type { PopoverDropdownProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import { useEffect } from "react";

export type { PopoverBaseProps, PopoverProps } from "@mantine/core";
export { getPopoverOverrides } from "./Popover.styled";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type ExtendedPopoverDropdownProps = PopoverDropdownProps & {
  // Prevent parent TippyPopover from closing when selecting an item
  // TODO: remove when TippyPopover is no longer used
  setupSequencedCloseHandler?: boolean;
};

const PopoverDropdown = function PopoverDropdown(
  props: ExtendedPopoverDropdownProps,
) {
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    if (!props.setupSequencedCloseHandler) {
      return;
    }
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler, props.setupSequencedCloseHandler]);

  return (
    <MantinePopoverDropdown {...props} data-element-id="mantine-popover" />
  );
};
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;
MantinePopover.Dropdown = PopoverDropdown;

const Popover: typeof MantinePopover & {
  Dropdown: typeof PopoverDropdown;
} = MantinePopover;

export { Popover };
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.styled";

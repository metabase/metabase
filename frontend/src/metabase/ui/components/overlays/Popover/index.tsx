import type { PopoverDropdownProps, PopoverProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import cx from "classnames";
import { useEffect } from "react";

import ZIndex from "metabase/css/core/z-index.module.css";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";

import { withLazyPortal } from "../utils";

export type { PopoverBaseProps, PopoverProps } from "@mantine/core";
export { getPopoverOverrides } from "./Popover.styled";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type ExtendedPopoverDropdownProps = PopoverDropdownProps & {
  // Prevent parent TippyPopover from closing when selecting an item
  // TODO: remove when TippyPopover is no longer used
  setupSequencedCloseHandler?: boolean;
};

const Popover = (props: PopoverProps) => (
  <MantinePopover {...withLazyPortal(props)} />
);

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
    <MantinePopoverDropdown
      {...props}
      className={cx(props.className, ZIndex.FloatingElement)}
      data-element-id="mantine-popover"
    />
  );
};
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;
Popover.Dropdown = PopoverDropdown;
Popover.Target = MantinePopover.Target;

export { Popover };

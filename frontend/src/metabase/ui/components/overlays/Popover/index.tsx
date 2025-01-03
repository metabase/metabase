import type { PopoverDropdownProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import cx from "classnames";
import { useEffect } from "react";

import ZIndex from "metabase/css/core/z-index.module.css";
import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import { PreventEagerPortal } from "metabase/ui";

export type { PopoverBaseProps, PopoverProps } from "@mantine/core";
export { getPopoverOverrides } from "./Popover.styled";

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
    <PreventEagerPortal {...props}>
      <MantinePopoverDropdown
        {...props}
        className={cx(props.className, ZIndex.Overlay)}
        data-element-id="mantine-popover"
      />
    </PreventEagerPortal>
  );
};
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;
MantinePopover.Dropdown = PopoverDropdown;

const Popover: typeof MantinePopover & {
  Dropdown: typeof PopoverDropdown;
} = MantinePopover;

export { Popover };

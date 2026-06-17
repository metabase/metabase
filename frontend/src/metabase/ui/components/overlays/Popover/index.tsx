import type { PopoverDropdownProps } from "@mantine/core";
import { Popover as MantinePopover } from "@mantine/core";
import cx from "classnames";
import { type Ref, forwardRef } from "react";

import ZIndex from "metabase/css/core/z-index.module.css";
import { PreventEagerPortal } from "metabase/ui";
import { OverlayStackItem } from "metabase/ui/components/overlays/overlay-stack";

export type { PopoverProps } from "@mantine/core";
export { popoverOverrides } from "./Popover.config";

const MantinePopoverDropdown = MantinePopover.Dropdown;

const PopoverDropdown = forwardRef(function PopoverDropdown(
  { children, ...props }: PopoverDropdownProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PreventEagerPortal {...props}>
      <MantinePopoverDropdown
        {...props}
        className={cx(props.className, ZIndex.Overlay)}
        data-element-id="mantine-popover"
        ref={ref}
      >
        <OverlayStackItem />
        {children}
      </MantinePopoverDropdown>
    </PreventEagerPortal>
  );
});

export const Popover = Object.assign(MantinePopover, {
  Dropdown: Object.assign(PopoverDropdown, {
    displayName: MantinePopoverDropdown.displayName,
  }),
});
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";

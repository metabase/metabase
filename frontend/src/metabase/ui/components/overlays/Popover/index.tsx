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

/**
 * Patches the shared `@mantine/core` object in place on purpose. Combobox, Menu,
 * HoverCard and ColorInput render `Popover.Dropdown` off it, and this is how they
 * inherit `PreventEagerPortal`. A copy would reach only direct `Popover` users.
 * The mutation is an import-time side effect, so `side-effect-free-modules.js`
 * lists this file in `SIDE_EFFECT_FULL_FILES` to keep it out of the
 * `sideEffects: false` rule that covers the rest of `metabase/ui`.
 */
export const Popover = Object.assign(MantinePopover, {
  Dropdown: Object.assign(PopoverDropdown, {
    displayName: MantinePopoverDropdown.displayName,
  }),
});
export { DEFAULT_POPOVER_Z_INDEX } from "./Popover.config";

import {
  type Factory,
  Popover as MantinePopover,
  type PopoverDropdownProps,
  type PopoverStylesNames,
  factory,
} from "@mantine/core";
import cx from "classnames";

import ZIndex from "metabase/css/core/z-index.module.css";
import { PreventEagerPortal } from "metabase/ui/components/utils/PreventEagerPortal";

import { OverlayStackItem } from "../overlay-stack";

const MantinePopoverDropdown = MantinePopover.Dropdown;

type PopoverDropdownFactory = Factory<{
  props: PopoverDropdownProps;
  ref: HTMLDivElement;
  stylesNames: PopoverStylesNames;
  compound: true;
}>;

export const PopoverDropdown = factory<PopoverDropdownFactory>(
  function PopoverDropdown({ children, ...props }, ref) {
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
  },
);
PopoverDropdown.classes = MantinePopoverDropdown.classes;
PopoverDropdown.displayName = MantinePopoverDropdown.displayName;

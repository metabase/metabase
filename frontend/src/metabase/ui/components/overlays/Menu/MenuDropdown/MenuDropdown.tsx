import type { MenuDropdownProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import type { Ref } from "react";
import { forwardRef } from "react";

import { PreventEagerPortal } from "metabase/ui";

export const MenuDropdown = forwardRef(function MenuDropdown(
  { children, ...props }: MenuDropdownProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <PreventEagerPortal {...props}>
      <Menu.Dropdown {...props} data-element-id="mantine-popover" ref={ref}>
        {children}
      </Menu.Dropdown>
    </PreventEagerPortal>
  );
});

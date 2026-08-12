import type { MenuFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import MenuStyles from "./Menu.module.css";

export const menuOverrides = {
  Menu: themeComponent<MenuFactory>({
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
      returnFocus: false,
    },
    classNames: {
      dropdown: MenuStyles.dropdown,
      item: MenuStyles.item,
      itemSection: MenuStyles.itemSection,
      label: MenuStyles.label,
      divider: MenuStyles.divider,
    },
  }),
};

import { Menu } from "@mantine/core";

import MenuStyles from "./Menu.module.css";

export const menuOverrides = {
  Menu: Menu.extend({
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
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

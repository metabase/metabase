import { Menu, MenuSub } from "@mantine/core";

import MenuStyles from "./Menu.module.css";

export const menuOverrides = {
  Menu: Menu.extend({
    defaultProps: {
      radius: "xs",
      shadow: "sm_outline",
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

  MenuSub: MenuSub.extend({
    defaultProps: {
      radius: "xs",
    },
  }),
};

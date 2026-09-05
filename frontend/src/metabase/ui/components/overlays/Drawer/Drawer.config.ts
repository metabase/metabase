import { Drawer, type MantineThemeOverride } from "@mantine/core";

export const drawerOverrides: MantineThemeOverride["components"] = {
  DrawerRoot: Drawer.Root.extend({
    defaultProps: {
      shadow: "xs_outline",
      padding: "lg",
    },
  }),
};

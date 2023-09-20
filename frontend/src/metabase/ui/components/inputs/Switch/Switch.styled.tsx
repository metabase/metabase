import type { MantineThemeOverride } from "@mantine/core";

export const getSwitchOverrides = (): MantineThemeOverride["components"] => ({
  Switch: {
    defaultProps: {
      color: "brand",
    },
  },
});

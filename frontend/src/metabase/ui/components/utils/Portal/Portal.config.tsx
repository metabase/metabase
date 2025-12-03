import { type MantineThemeOverride, Portal } from "@mantine/core";

export const portalOverrides: MantineThemeOverride["components"] = {
  Portal: Portal.extend({
    defaultProps: {
      reuseTargetNode: false,
    },
  }),
};

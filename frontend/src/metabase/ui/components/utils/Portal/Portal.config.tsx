import type { MantineThemeOverride, PortalProps } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

// Mantine does not re-export these payload types from the package root.
type PortalPayload = { props: PortalProps };

export const portalOverrides: MantineThemeOverride["components"] = {
  Portal: themeComponent<PortalPayload>({
    defaultProps: {
      reuseTargetNode: false,
    },
  }),
};

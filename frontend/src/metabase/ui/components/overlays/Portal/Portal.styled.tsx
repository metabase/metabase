import type { MantineThemeOverride } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getPortalOverrides = (): MantineThemeOverride["components"] => ({
  Portal: {
    // FIXME: Do just one of these
    defaultProps: {
      zIndex: "var(--mb-floating-element-z-index)",
    },
    classNames: { dropdown: ZIndex.FloatingElement },
  },
});

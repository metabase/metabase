import type { MantineThemeOverride } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getPortalOverrides = (): MantineThemeOverride["components"] => ({
  Portal: {
    classNames: { dropdown: ZIndex.FloatingElement },
  },
});

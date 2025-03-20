import type { MantineThemeOverride } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getDrawerOverrides = (): MantineThemeOverride["components"] => ({
  Drawer: {
    defaultProps: {
      withinPortal: true,
    },
    classNames: {
      root: ZIndex.Overlay,
    },
  },
});

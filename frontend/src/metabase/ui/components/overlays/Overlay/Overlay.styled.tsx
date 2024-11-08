import type { MantineThemeOverride } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getOverlayOverrides = (): MantineThemeOverride["components"] => ({
  Overlay: {
    classNames: { root: ZIndex.FloatingElement },
  },
});

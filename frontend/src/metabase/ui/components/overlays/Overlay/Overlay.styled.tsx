import type { MantineThemeOverride, OverlayProps } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

// Putting this here ensures it's typed correctly
const defaultProps: OverlayProps = {};

export const getOverlayOverrides = (): MantineThemeOverride["components"] => ({
  Overlay: {
    defaultProps,
    classNames: { root: ZIndex.Overlay },
  },
});

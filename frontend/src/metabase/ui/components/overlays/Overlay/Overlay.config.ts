import {
  LoadingOverlay,
  type MantineThemeOverride,
  Overlay,
} from "@mantine/core";

import OverlayStyles from "./Overlay.module.css";

export const overlayOverrides: MantineThemeOverride["components"] = {
  Overlay: Overlay.extend({
    classNames: {
      root: OverlayStyles.root,
    },
  }),
  LoadingOverlay: LoadingOverlay.extend({
    defaultProps: {
      // In order not to overlap the dropdowns, e.g. in table filters while data is loading.
      zIndex: "calc(var(--mb-overlay-z-index) - 1)",
    },
  }),
};

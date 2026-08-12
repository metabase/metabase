import type {
  LoadingOverlayFactory,
  MantineThemeOverride,
  OverlayFactory,
} from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import OverlayStyles from "./Overlay.module.css";

export const overlayOverrides: MantineThemeOverride["components"] = {
  Overlay: themeComponent<OverlayFactory>({
    classNames: {
      root: OverlayStyles.root,
    },
  }),
  LoadingOverlay: themeComponent<LoadingOverlayFactory>({
    defaultProps: {
      // In order not to overlap the dropdowns, e.g. in table filters while data is loading.
      zIndex: "calc(var(--mb-overlay-z-index) - 1)",
    },
  }),
};

import { type MantineThemeOverride, Overlay } from "@mantine/core";

import OverlayStyles from "./Overlay.module.css";

export const overlayOverrides: MantineThemeOverride["components"] = {
  Overlay: Overlay.extend({
    classNames: {
      root: OverlayStyles.root,
    },
  }),
};

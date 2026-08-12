import type { AnchorFactory, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import AnchorStyles from "./Anchor.module.css";

export const anchorOverrides: MantineThemeOverride["components"] = {
  Anchor: themeComponent<AnchorFactory>({
    classNames: {
      root: AnchorStyles.root,
    },
  }),
};

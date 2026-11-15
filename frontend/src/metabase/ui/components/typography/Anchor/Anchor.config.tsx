import { Anchor, type MantineThemeOverride } from "@mantine/core";

import AnchorStyles from "./Anchor.module.css";

export const anchorOverrides: MantineThemeOverride["components"] = {
  Anchor: Anchor.extend({
    defaultProps: {
      size: "md",
      fw: 400,
    },
    classNames: {
      root: AnchorStyles.root,
    },
  }),
};

import { HoverCard, type MantineThemeOverride } from "@mantine/core";

import HoverCardStyles from "./HoverCard.module.css";

export const hoverCardOverrides: MantineThemeOverride["components"] = {
  HoverCard: HoverCard.extend({
    defaultProps: {
      radius: "sm",
      shadow: "md",
      withinPortal: true,
      middlewares: { shift: true, flip: true, size: true },
    },
    classNames: {
      dropdown: HoverCardStyles.dropdown,
    },
  }),
};

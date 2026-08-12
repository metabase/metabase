import type { HoverCardProps, MantineThemeOverride } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import HoverCardStyles from "./HoverCard.module.css";

// Mantine does not re-export these payload types from the package root.
type HoverCardPayload = { props: HoverCardProps; stylesNames: string };

export const hoverCardOverrides: MantineThemeOverride["components"] = {
  HoverCard: themeComponent<HoverCardPayload>({
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

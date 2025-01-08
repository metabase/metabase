import type { MantineThemeOverride } from "@mantine/core";

import ZIndex from "metabase/css/core/z-index.module.css";

export const getHoverCardOverrides =
  (): MantineThemeOverride["components"] => ({
    HoverCard: {
      defaultProps: {
        radius: "sm",
        shadow: "md",
        withinPortal: true,
        middlewares: { shift: true, flip: true, size: true },
      },
      classNames: { root: ZIndex.Overlay },
      styles: theme => ({
        dropdown: {
          padding: 0,
          overflow: "auto",
          background: theme.fn.themeColor("bg-white"),
        },
      }),
    },
  });

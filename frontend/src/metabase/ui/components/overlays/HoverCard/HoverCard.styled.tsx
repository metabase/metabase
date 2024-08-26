import type { MantineThemeOverride } from "@mantine/core";

export const getHoverCardOverrides =
  (): MantineThemeOverride["components"] => ({
    HoverCard: {
      defaultProps: {
        radius: "sm",
        shadow: "md",
        withinPortal: true,
        middlewares: { shift: true, flip: true, size: true },
      },
      styles: theme => ({
        dropdown: {
          padding: 0,
          overflow: "auto",
          background: theme.fn.themeColor("bg-white"),
        },
      }),
    },
  });

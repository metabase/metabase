import type { MantineThemeOverride } from "@mantine/core";

export const getAnchorOverrides = (): MantineThemeOverride["components"] => ({
  Anchor: {
    styles: theme => {
      return {
        root: {
          color: theme.fn.themeColor("brand"),
          "&:active": {
            color: theme.fn.themeColor("text-dark"),
            textDecoration: "underline",
          },
        },
      };
    },
  },
});

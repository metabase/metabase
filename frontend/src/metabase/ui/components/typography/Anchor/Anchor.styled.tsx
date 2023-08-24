import type { MantineThemeOverride } from "@mantine/core";

export const getAnchorOverrides = (): MantineThemeOverride["components"] => ({
  Anchor: {
    styles: theme => {
      return {
        root: {
          fontFamily: "inherit",
          color: theme.colors.brand[1],
          "&:active": {
            color: theme.colors.text[2],
            textDecoration: "underline",
          },
        },
      };
    },
  },
});

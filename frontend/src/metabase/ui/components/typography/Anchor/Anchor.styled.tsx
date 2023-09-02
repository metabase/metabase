import type { MantineThemeOverride } from "@mantine/core";

export const getAnchorOverrides = (): MantineThemeOverride["components"] => ({
  Anchor: {
    styles: theme => {
      return {
        root: {
          fontFamily: "inherit",
          color: theme.fn.primaryColor(),
          "&:focus": {
            outline: `2px solid ${theme.colors.brand[0]}`,
            outlineOffset: "2px",
          },
          "&:active": {
            color: theme.colors.text[2],
            textDecoration: "underline",
          },
        },
      };
    },
  },
});

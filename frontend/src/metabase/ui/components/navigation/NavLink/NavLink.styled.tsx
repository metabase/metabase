import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";

export const getNavLinkOverrides = (): MantineThemeOverride["components"] => ({
  NavLink: {
    styles: {
      root: {
        borderRadius: rem(8),
      },
      label: {
        fontSize: rem(14),
      },
    },
    variants: {
      "mb-light": theme => ({
        root: {
          "&:hover": {
            backgroundColor: theme.fn.themeColor("brand-lighter"),
          },

          "&[data-active]": {
            backgroundColor: theme.fn.themeColor("brand-lighter"),
            color: theme.fn.themeColor("text-dark"),
          },
        },
        icon: {
          color: theme.fn.themeColor("text-dark"),
        },
      }),
      "mb-dark": theme => ({
        root: {
          "&:hover": {
            backgroundColor: theme.fn.themeColor("brand-lighter"),
          },
          "&[data-active]": {
            "&:hover": {
              backgroundColor: theme.fn.themeColor("brand"),
            },

            backgroundColor: theme.fn.themeColor("brand"),
            color: "white",

            "& .emotion-NavLink-label": {
              color: "white",
            },

            "& .emotion-NavLink-icon": {
              color: "white",
            },
          },
        },
      }),
    },
  },
});

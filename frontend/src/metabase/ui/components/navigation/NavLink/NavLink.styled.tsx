import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";

export const getNavLinkOverrides = (): MantineThemeOverride["components"] => ({
  NavLink: {
    styles: theme => {
      return {
        root: {
          borderRadius: rem(8),

          "&:hover": {
            backgroundColor: theme.fn.themeColor("brand-lighter"),
            // ".emotion-NavLink-label, .emotion-NavLink-icon": {
            //   color: "white",
            // },
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

        label: {
          fontSize: rem(14),
        },

        icon: {
          color: theme.fn.themeColor("text-dark"),
        },
      };
    },
  },
});

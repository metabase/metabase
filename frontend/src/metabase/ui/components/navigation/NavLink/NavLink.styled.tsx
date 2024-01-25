import { rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

export const getNavLinkOverrides = (): MantineThemeOverride["components"] => ({
  NavLink: {
    styles: theme => {
      return {
        root: {
          borderRadius: rem(8),


          "&:hover": {
            backgroundColor: theme.fn.themeColor("background"),
            ".emotion-NavLink-label, .emotion-NavLink-icon": {
              color: "white",
            },
          },

          "&[data-active]": {
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

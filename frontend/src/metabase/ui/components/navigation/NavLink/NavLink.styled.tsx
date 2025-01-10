import type { MantineThemeOverride } from "@mantine/core";
import { rem } from "@mantine/core";

export const getNavLinkOverrides = (): MantineThemeOverride["components"] => ({
  NavLink: {
    styles: theme => ({
      root: {
        borderRadius: rem(8),
      },
      label: {
        fontSize: rem(14),
      },
      icon: {
        color: theme.fn.themeColor("text-dark"),
      },
      rightSection: {
        // Apply default icon color for section icons when inactive
        "&:not([data-active] &)": {
          color: "var(--mb-color-text-primary)",
        },
      },
    }),
    variants: {
      default: () => ({
        root: {
          "&:hover": {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },
          "&[data-active]": {
            "&:hover": {
              backgroundColor: "var(--mb-color-brand)",
            },

            backgroundColor: "var(--mb-color-brand)",
            color: "var(--mb-color-text-white)",

            "& .emotion-NavLink-label": {
              color: "var(--mb-color-text-white)",
            },

            "& .emotion-NavLink-icon": {
              color: "var(--mb-color-text-white)",
            },
          },
        },
      }),
      "mb-light": () => ({
        root: {
          "&:hover": {
            backgroundColor: "var(--mb-color-brand-lighter)",
          },

          "&[data-active]": {
            backgroundColor: "var(--mb-color-bg-medium)",
          },
        },
      }),
    },
  },
});

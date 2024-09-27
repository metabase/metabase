import type { MantineThemeOverride } from "@mantine/core";

export const getActionIconOverrides =
  (): MantineThemeOverride["components"] => ({
    ActionIcon: {
      styles: () => ({
        root: {
          "&[data-disabled]": {
            color: "var(--mb-color-text-light)",
            pointerEvents: "all",
          },
        },
      }),
      variants: {
        // Default variant is "subtle"
        subtle: () => ({
          root: {
            color: "var(--mb-color-text-tertiary)",
            "&:hover": {
              color: "var(--mb-color-text-secondary)",
              backgroundColor: "var(--mb-color-bg-light)",
            },
          },
        }),
        viewHeader: theme => ({
          root: {
            color: theme.fn.themeColor("text-dark"),
            backgroundColor: "transparent",
            border: "1px solid transparent",
            transition: "all 300ms linear",
            "&:hover": {
              color: theme.fn.themeColor("brand"),
              backgroundColor: theme.fn.themeColor("bg-medium"),
              border: "1px solid transparent",
            },
            "&:disabled, &[data-disabled]": {
              color: theme.fn.themeColor("text-light"),
              backgroundColor: "transparent",
            },
          },
        }),
        viewFooter: theme => ({
          root: {
            color: theme.fn.themeColor("text-medium"),
            "&:hover": {
              color: theme.fn.themeColor("brand"),
            },
            "&:disabled, &[data-disabled]": {
              color: theme.fn.themeColor("text-light"),
              backgroundColor: "transparent",
            },
          },
        }),
      },
    },
  });

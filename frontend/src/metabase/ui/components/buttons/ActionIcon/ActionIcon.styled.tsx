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
        filled: (theme, params) => ({
          root: {
            color: theme.fn.themeColor("white"),
            backgroundColor: theme.fn.themeColor(params.color),
            border: `1px solid ${theme.fn.themeColor(params.color)}`,
            transition: "background 300ms linear, border 300ms linear",
            "&:hover": {
              backgroundColor: theme.fn.themeColor("white"),
              border: `1px solid ${theme.fn.themeColor(params.color)}`,
              color: theme.fn.themeColor(params.color),
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

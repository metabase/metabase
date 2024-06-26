import type { MantineThemeOverride } from "@mantine/core";

export const getActionIconOverrides =
  (): MantineThemeOverride["components"] => ({
    ActionIcon: {
      variants: {
        subtle: theme => ({
          root: {
            color: theme.fn.themeColor("text-light"),
            "&:hover": {
              color: theme.fn.themeColor("text-medium"),
              backgroundColor: theme.fn.themeColor("bg-light"),
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
            transition: "background 300ms linear, border 300ms linear",
            "&:hover": {
              color: theme.fn.themeColor("brand"),
              backgroundColor: theme.fn.themeColor("bg-medium"),
              border: "1px solid transparent",
            },
          },
        }),
      },
    },
  });

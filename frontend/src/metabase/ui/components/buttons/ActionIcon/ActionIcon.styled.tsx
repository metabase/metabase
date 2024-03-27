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
        transparent: theme => ({
          root: {
            color: theme.fn.themeColor("text-dark"),
            "&:hover": {
              color: theme.fn.themeColor("brand"),
              backgroundColor: theme.fn.themeColor("bg-medium"),
            },
          },
        }),
        filled: theme => ({
          root: {
            color: theme.fn.themeColor("white"),
            backgroundColor: theme.fn.themeColor("brand"),
            "&:hover": {
              color: theme.fn.themeColor("brand"),
              backgroundColor: theme.fn.themeColor("bg-medium"),
              borderColor: theme.fn.themeColor("brand"),
            },
          },
        }),
      },
    },
  });

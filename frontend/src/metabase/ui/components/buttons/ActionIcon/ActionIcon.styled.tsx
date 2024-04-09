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
      },
    },
  });

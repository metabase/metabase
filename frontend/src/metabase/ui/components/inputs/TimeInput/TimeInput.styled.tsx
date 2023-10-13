import type { MantineThemeOverride } from "@mantine/core";

export const getTimeInputOverrides =
  (): MantineThemeOverride["components"] => ({
    TimeInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
        },
      }),
    },
  });

import type { MantineThemeOverride } from "@mantine/core";

export const getDateInputOverrides =
  (): MantineThemeOverride["components"] => ({
    DateInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        wrapper: {
          marginTop: theme.spacing.xs,
        },
      }),
    },
  });

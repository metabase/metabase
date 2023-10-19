import type { MantineThemeOverride } from "@mantine/core";

export const getDateInputOverrides =
  (): MantineThemeOverride["components"] => ({
    DateInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
        },
        calendar: {
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        },
      }),
    },
  });

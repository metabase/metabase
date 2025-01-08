import type { MantineThemeOverride } from "@mantine/core";

export const getDateInputOverrides =
  (): MantineThemeOverride["components"] => ({
    DateInput: {
      defaultProps: {
        size: "md",
      },
      styles: theme => ({
        calendar: {
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        },
        input: {
          color: "var(--mb-color-text-primary)",
          backgroundColor: "var(--mb-color-background)",
        },
      }),
    },
  });

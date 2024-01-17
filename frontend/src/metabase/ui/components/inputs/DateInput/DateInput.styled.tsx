import type { MantineThemeOverride } from "@mantine/core";
import { getSize } from "@mantine/core";

export const getDateInputOverrides =
  (): MantineThemeOverride["components"] => ({
    DateInput: {
      defaultProps: {
        size: "md",
      },
      styles: (theme, _, { size = "md" }) => ({
        wrapper: {
          "&:not(:only-child)": {
            marginTop: theme.spacing.xs,
          },
        },
        calendar: {
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        },
        label: {
          color: theme.fn.themeColor("text-medium"),
          fontSize: getSize({ size, sizes: theme.fontSizes }),
        },
      }),
    },
  });

import type { MantineThemeOverride } from "@mantine/core";

export const getDividerOverrides = (): MantineThemeOverride["components"] => ({
  Divider: {
    styles: theme => ({
      horizontal: {
        borderTopColor: theme.colors.border[0],
      },
      vertical: {
        borderLeftColor: theme.colors.border[0],
      },
      label: {
        "&::before": {
          marginRight: theme.spacing.sm,
          borderTopColor: theme.colors.border[0],
        },
        "&::after": {
          marginLeft: theme.spacing.sm,
          borderTopColor: theme.colors.border[0],
        },
      },
      labelDefaultStyles: {
        color: theme.colors.text[2],
      },
    }),
  },
});

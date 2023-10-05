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
          borderTopColor: theme.colors.border[0],
        },
        "&::after": {
          borderTopColor: theme.colors.border[0],
        },
      },
      labelDefaultStyles: {
        color: theme.colors.text[2],
      },
    }),
  },
});

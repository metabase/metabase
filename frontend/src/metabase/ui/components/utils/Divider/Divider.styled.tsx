import type { MantineThemeOverride } from "@mantine/core";

export const getDividerOverrides = (): MantineThemeOverride["components"] => ({
  Divider: {
    styles: theme => ({
      horizontal: {
        borderTopColor: theme.fn.themeColor("border"),
      },
      vertical: {
        borderLeftColor: theme.fn.themeColor("border"),
      },
      label: {
        "&::before": {
          borderTopColor: theme.fn.themeColor("border"),
        },
        "&::after": {
          borderTopColor: theme.fn.themeColor("border"),
        },
      },
      labelDefaultStyles: {
        color: theme.fn.themeColor("text-dark"),
      },
    }),
  },
});

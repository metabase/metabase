import type { MantineThemeOverride } from "@mantine/core";

export const getTooltipOverrides = (): MantineThemeOverride["components"] => ({
  Tooltip: {
    defaultProps: {
      withinPortal: true,
    },
    styles: theme => ({
      tooltip: {
        fontSize: theme.fontSizes.md,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        color: theme.white,
        backgroundColor: theme.black,
      },
    }),
  },
});

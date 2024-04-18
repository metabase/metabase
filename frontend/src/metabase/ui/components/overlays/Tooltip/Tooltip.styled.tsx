import type { MantineThemeOverride } from "@mantine/core";

export const getTooltipOverrides = (): MantineThemeOverride["components"] => ({
  Tooltip: {
    defaultProps: {
      arrowSize: 10,
      withArrow: true,
      withinPortal: true,
      transitionProps: {
        transition: "fade",
        duration: 200,
      },
      events: {
        hover: true,
        focus: true,
        touch: true,
      },
    },
    styles: theme => ({
      tooltip: {
        backgroundColor: theme.fn.themeColor("bg-black"),
        color: theme.white,
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        padding: "0.6rem 0.75rem",
      },
    }),
  },
});

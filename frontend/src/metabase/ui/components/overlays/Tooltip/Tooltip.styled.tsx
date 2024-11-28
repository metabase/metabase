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
        backgroundColor: "var(--mb-color-tooltip-background)",
        color: "var(--mb-color-tooltip-text)",
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        padding: "0.6rem 0.75rem",
      },
    }),
  },
});

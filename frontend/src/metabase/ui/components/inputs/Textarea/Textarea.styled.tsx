import type { MantineThemeOverride } from "@mantine/core";

export const getTextareaOverrides = (): MantineThemeOverride["components"] => ({
  Textarea: {
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

import type { MantineThemeOverride } from "@mantine/core";

export const getTextareaOverrides = (): MantineThemeOverride["components"] => ({
  Textarea: {
    defaultProps: {
      size: "md",
    },
    styles: theme => ({
      wrapper: {
        "&:not(:only-child)": {
          marginTop: theme.spacing.xs,
        },
      },
    }),
  },
});

import type { MantineThemeOverride } from "@mantine/core";

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    defaultProps: {
      size: "md",
    },
  },
  InputWrapper: {
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "error", "input"],
    },
    styles: theme => ({
      label: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: "1rem",
      },
      description: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
      },
      error: {
        color: theme.colors.error[0],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
      },
    }),
  },
});

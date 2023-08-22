import type { MantineThemeOverride } from "@mantine/core";

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    sizes: {
      md: theme => ({
        input: {
          fontSize: theme.fontSizes.md,
        },
      }),
    },
    variants: {
      default: theme => ({
        input: {
          color: theme.colors.text[2],
          borderColor: theme.colors.border[0],
          "&:focus": {
            borderColor: theme.colors.brand[2],
          },
          "&:disabled": {
            backgroundColor: theme.colors.bg[0],
          },
          "&::placeholder": {
            color: theme.colors.text[0],
          },
        },
      }),
    },
  },
});

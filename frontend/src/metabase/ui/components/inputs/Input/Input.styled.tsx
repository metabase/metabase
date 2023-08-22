import type { MantineThemeOverride } from "@mantine/core";

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    styles: theme => ({
      wrapper: {
        display: "flex",
        border: `1px solid ${theme.colors.border[0]}`,
        "&:focus-within": {
          borderColor: theme.colors.brand[2],
        },
      },
      input: {
        flex: 1,
        border: "none",
      },
      icon: {
        display: "block",
        color: theme.colors.text[2],
      },
      rightSection: {
        display: "block",
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
      },
    }),
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

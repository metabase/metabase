import type { MantineThemeOverride } from "@mantine/core";

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    defaultProps: {
      size: "md",
    },
    styles: theme => ({
      input: {
        color: theme.colors.text[2],
        paddingLeft: "0.75rem",
        borderRadius: theme.radius.xs,
        "&::placeholder": {
          color: theme.colors.text[0],
        },
        "&:disabled": {
          backgroundColor: theme.colors.bg[0],
        },
        "&[data-invalid]": {
          color: theme.colors.error[0],
          borderColor: theme.colors.error[0],
          "&::placeholder": {
            color: theme.colors.error[0],
          },
        },
      },
      icon: {
        color: theme.colors.text[2],
      },
      rightSection: {
        color: theme.colors.text[2],
      },
    }),
    sizes: {
      md: () => ({
        input: {
          "&[data-with-icon]": {
            paddingLeft: "2.5rem",
          },
        },
      }),
    },
    variants: {
      default: theme => ({
        input: {
          borderColor: theme.colors.border[0],
          "&:focus": {
            borderColor: theme.colors.brand[1],
          },
        },
      }),
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
      required: {
        color: theme.colors.error[0],
      },
    }),
  },
});

import { rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    defaultProps: {
      size: "md",
      unstyled: true,
    },
    styles: theme => ({
      wrapper: {
        display: "flex",
        alignItems: "center",
      },
      input: {
        flex: 1,
        appearance: "none",
        border: "none",
        padding: 0,
        fontWeight: "bold",
        "&:focus": {
          outline: "none",
        },
      },
      icon: {
        display: "flex",
        alignItems: "center",
        color: theme.colors.text[2],
      },
      rightSection: {
        display: "flex",
        alignItems: "center",
        color: theme.colors.text[0],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
      },
    }),
    sizes: {
      md: theme => ({
        wrapper: {
          padding: `${rem(7)} ${rem(11)}`,
        },
        input: {
          fontSize: theme.fontSizes.md,
          lineHeight: "1.5rem",
        },
        icon: {
          marginRight: "0.75rem",
        },
        rightSection: {
          marginLeft: "0.75rem",
        },
      }),
    },
    variants: {
      default: theme => ({
        wrapper: {
          border: `1px solid ${theme.colors.border[0]}`,
          borderRadius: theme.radius.xs,
          backgroundColor: theme.white,
          "&:focus-within": {
            borderColor: theme.colors.brand[1],
          },
          "&:disabled": {
            backgroundColor: theme.colors.bg[0],
          },
        },
        input: {
          color: theme.colors.text[2],
          borderColor: theme.colors.border[0],
          "&::placeholder": {
            color: theme.colors.text[0],
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
    }),
  },
});

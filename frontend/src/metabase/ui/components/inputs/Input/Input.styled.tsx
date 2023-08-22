import { getStylesRef } from "@mantine/core";
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
        color: theme.colors.text[0],
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
      root: {
        "&:has(input:disabled)": {
          [`.${getStylesRef("label")}, .${getStylesRef("description")}`]: {
            color: theme.colors.text[0],
          },
        },
      },
      label: {
        ref: getStylesRef("label"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: "1rem",
        "&:nth-last-child(2)": {
          marginBottom: theme.spacing.xs,
        },
      },
      description: {
        ref: getStylesRef("description"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
        "&:nth-last-child(2)": {
          marginBottom: theme.spacing.xs,
        },
      },
      error: {
        color: theme.colors.error[0],
        fontSize: theme.fontSizes.xs,
        lineHeight: "1rem",
        "&:nth-last-child(2)": {
          marginBottom: theme.spacing.xs,
        },
      },
      required: {
        color: theme.colors.error[0],
      },
    }),
  },
});

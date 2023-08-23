import { getSize, getStylesRef, rem } from "@mantine/core";
import type { InputStylesParams, MantineThemeOverride } from "@mantine/core";

const SIZES = {
  xs: rem(28),
  md: rem(40),
};

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    defaultProps: {
      size: "md",
    },
    styles: (theme, { multiline }: InputStylesParams, { size = "md" }) => ({
      input: {
        color: theme.colors.text[2],
        borderRadius: theme.radius.xs,
        height: multiline ? "auto" : getSize({ size, sizes: SIZES }),
        minHeight: getSize({ size, sizes: SIZES }),
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
    variants: {
      default: theme => ({
        input: {
          paddingLeft: rem(11),
          borderColor: theme.colors.border[0],
          "&:focus": {
            borderColor: theme.colors.brand[1],
          },
          "&[data-with-icon]": {
            paddingLeft: rem(39),
          },
        },
        icon: {
          width: rem(40),
        },
      }),
      unstyled: () => ({
        input: {
          "&[data-with-icon]": {
            paddingLeft: rem(28),
          },
        },
        icon: {
          width: rem(28),
          justifyContent: "left",
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

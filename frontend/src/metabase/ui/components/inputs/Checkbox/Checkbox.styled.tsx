import { getStylesRef, getSize, rem } from "@mantine/core";
import type {
  CheckboxStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { CheckboxIcon } from "./CheckboxIcon";

const SIZES = {
  md: rem(20),
};

export const getCheckboxOverrides = (): MantineThemeOverride["components"] => ({
  Checkbox: {
    defaultProps: {
      icon: CheckboxIcon,
      size: "md",
    },
    styles: (
      theme: MantineTheme,
      { labelPosition: _labelPosition }: CheckboxStylesParams,
      { size = "md" },
    ) => ({
      root: {
        [`&:has(.${getStylesRef("input")}:disabled)`]: {
          [`.${getStylesRef("label")}`]: {
            color: theme.colors.text[0],
          },
          [`.${getStylesRef("description")}`]: {
            color: theme.colors.text[0],
          },
          [`.${getStylesRef("icon")}`]: {
            color: theme.colors.text[0],
          },
        },
      },
      inner: {
        width: getSize({ size, sizes: SIZES }),
        height: getSize({ size, sizes: SIZES }),
      },
      input: {
        ref: getStylesRef("input"),
        width: getSize({ size, sizes: SIZES }),
        height: getSize({ size, sizes: SIZES }),
        cursor: "pointer",
        borderRadius: theme.radius.xs,
        border: `1px solid ${theme.colors.bg[2]}`,

        "&:checked": {
          borderColor: theme.colors.brand[1],
          backgroundColor: theme.colors.brand[1],
          [`.${getStylesRef("icon")}`]: {
            color: theme.white,
          },
        },
        "&:disabled": {
          borderColor: theme.colors.border[0],
          backgroundColor: theme.colors.border[0],
        },
      },
      label: {
        ref: getStylesRef("label"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
        lineHeight: theme.lineHeight,
      },
      description: {
        ref: getStylesRef("description"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        lineHeight: theme.lineHeight,
        marginTop: theme.spacing.xs,
      },
      icon: {
        ref: getStylesRef("icon"),
        color: theme.colors.text[0],
      },
    }),
    variants: {
      stacked: (theme, { labelPosition }) => ({
        inner: {
          position: "relative",
          zIndex: 0,
        },
        label: {
          paddingLeft: labelPosition === "right" ? "0.75rem" : "0.5rem",
        },
        description: {
          paddingLeft: labelPosition === "right" ? "0.75rem" : "0.5rem",
        },
        input: {
          "&:after": {
            content: "''",
            border: `1px solid ${theme.colors.bg[2]}`,
            position: "absolute",
            top: rem(-4),
            left: rem(4),
            height: "100%",
            width: "100%",
            borderRadius: rem(4),
            zIndex: -1,
            backgroundColor: theme.white,
            boxSizing: "border-box",
          },

          "&:checked:not([disabled]):after": {
            border: `${rem(2)} solid ${theme.colors.brand[1]}`,
          },

          "&:disabled:after": {
            border: `${rem(2)} solid ${theme.colors.border[0]}`,
          },
        },
        labelWrapper: {
          psoition: "relative",
          top: rem(-2),
        },
      }),
    },
  },
});

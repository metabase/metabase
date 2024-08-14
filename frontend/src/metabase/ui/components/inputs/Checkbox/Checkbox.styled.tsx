import type {
  CheckboxStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getStylesRef, getSize, rem } from "@mantine/core";

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
            color: "var(--mb-color-text-tertiary)",
          },
          [`.${getStylesRef("description")}`]: {
            color: "var(--mb-color-text-tertiary)",
          },
          [`.${getStylesRef("icon")}`]: {
            color: "var(--mb-color-text-tertiary)",
          },
        },
      },
      body: { alignItems: "center" },
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
        border: "1px solid var(--mb-color-text-secondary)",
        backgroundColor: "var(--mb-color-background)",

        "&:checked": {
          borderColor: "var(--mb-color-background-brand)",
          backgroundColor: "var(--mb-color-background-brand)",
          [`.${getStylesRef("icon")}`]: {
            color: theme.white,
          },
        },
        "&:disabled": {
          borderColor: "var(--mb-color-background-disabled)",
          backgroundColor: "var(--mb-color-background-disabled)",
        },
      },
      label: {
        ref: getStylesRef("label"),
        color: "var(--mb-color-text-primary)",
        fontSize: theme.fontSizes.md,
        lineHeight: theme.lineHeight,
        cursor: "pointer",
      },
      description: {
        ref: getStylesRef("description"),
        color: "var(--mb-color-text-primary)",
        fontSize: theme.fontSizes.sm,
        lineHeight: theme.lineHeight,
        marginTop: theme.spacing.xs,
      },
      icon: {
        ref: getStylesRef("icon"),
        color: theme.fn.themeColor("text-light"),
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
            border: `1px solid ${theme.fn.themeColor("bg-dark")}`,
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
            border: `${rem(2)} solid ${theme.fn.themeColor("brand")}`,
          },

          "&:disabled:after": {
            border: `${rem(2)} solid ${theme.fn.themeColor("border")}`,
          },
        },
        labelWrapper: {
          top: rem(-2),
        },
      }),
    },
  },
});

import type { MantineTheme, MantineThemeOverride } from "@mantine/core";
import { getSize, getStylesRef, rem } from "@mantine/core";

const SIZES = {
  md: rem(20),
};

export const getRadioOverrides = (): MantineThemeOverride["components"] => ({
  Radio: {
    defaultProps: {
      size: "md",
    },
    variants: {
      pill: (theme: MantineTheme) => ({
        root: {
          display: "inline-block",
        },
        inner: {
          display: "none",
        },
        body: {},
        label: {
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: "3rem",
          height: "2rem",
          borderRadius: theme.radius.xl,
          backgroundColor: "var(--mb-color-brand-light)",
          fontSize: theme.fontSizes.sm,
          cursor: "pointer",
          transition: "all 0.2s ease",
          padding: 0,
          "&:not([data-checked])": {
            color: theme.fn.themeColor("brand"),
          },
          "[data-checked] &": {
            backgroundColor: theme.fn.themeColor("brand"),
            color: "white",
          },
        },
      }),
    },
    styles: (theme: MantineTheme, { size = "md" }) => ({
      root: {
        [`&:has(.${getStylesRef("input")}:disabled)`]: {
          [`.${getStylesRef("label")}`]: {
            color: theme.fn.themeColor("text-light"),
          },
          [`.${getStylesRef("description")}`]: {
            color: theme.fn.themeColor("text-light"),
          },
          [`.${getStylesRef("icon")}`]: {
            color: theme.white,
          },
        },
      },
      inner: {
        width: getSize({ size, sizes: SIZES }),
        height: getSize({ size, sizes: SIZES }),
      },
      radio: {
        ref: getStylesRef("input"),
        width: getSize({ size, sizes: SIZES }),
        height: getSize({ size, sizes: SIZES }),
        cursor: "pointer",
        borderColor: theme.fn.themeColor("text-light"),

        "&:checked": {
          borderColor: theme.fn.themeColor("brand"),
          backgroundColor: theme.fn.themeColor("brand"),
        },
        "&:disabled": {
          opacity: 0.3,
        },
        "&:disabled:not(:checked)": {
          borderColor: theme.fn.themeColor("text-light"),
          backgroundColor: theme.fn.themeColor("bg-medium"),
        },
      },
      label: {
        ref: getStylesRef("label"),
        color: theme.fn.themeColor("text-dark"),
        fontSize: theme.fontSizes.md,
      },
      description: {
        ref: getStylesRef("description"),
        color: theme.fn.themeColor("text-dark"),
        fontSize: theme.fontSizes.sm,
        lineHeight: theme.lineHeight,
        marginTop: theme.spacing.xs,
      },
      icon: {
        ref: getStylesRef("icon"),
      },
    }),
  },
});

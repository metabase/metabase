import type {
  RadioStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getStylesRef, getSize, rem } from "@mantine/core";

const SIZES = {
  md: rem(20),
};

export const getRadioOverrides = (): MantineThemeOverride["components"] => ({
  Radio: {
    defaultProps: {
      size: "md",
    },
    styles: (
      theme: MantineTheme,
      { labelPosition: _labelPosition }: RadioStylesParams,
      { size = "md" },
    ) => ({
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

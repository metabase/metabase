import { getStylesRef, getSize, rem } from "@mantine/core";
import type {
  RadioStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";

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
            color: theme.colors.text[0],
          },
          [`.${getStylesRef("description")}`]: {
            color: theme.colors.text[0],
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
        borderColor: theme.colors.text[0],

        "&:checked": {
          borderColor: theme.colors.brand[1],
          backgroundColor: theme.colors.brand[1],
        },
        "&:disabled": {
          opacity: 0.3,
        },
        "&:disabled:not(:checked)": {
          borderColor: theme.colors.text[0],
          backgroundColor: theme.colors.bg[1],
        },
      },
      label: {
        ref: getStylesRef("label"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.md,
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
      },
    }),
  },
});

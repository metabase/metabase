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
      { labelPosition }: CheckboxStylesParams,
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
        fontWeight: "bold",
        lineHeight: "1rem",
        paddingLeft: labelPosition === "left" ? theme.spacing.sm : undefined,
        paddingRight: labelPosition === "right" ? theme.spacing.sm : undefined,
      },
      description: {
        ref: getStylesRef("description"),
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        lineHeight: "1rem",
        marginTop: theme.spacing.xs,
      },
      icon: {
        ref: getStylesRef("icon"),
        color: theme.colors.text[0],
      },
    }),
  },
});

import { getStylesRef, getSize, rem } from "@mantine/core";
import type {
  CheckboxStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { color } from "metabase/lib/colors";
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
      body: {
        alignItems: "center",
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
        input: {
          "&:after": {
            content: "''",
            border: `1px solid ${theme.colors.gray[4]}`,
            position: "absolute",
            top: "-4px",
            left: "4px",
            height: "100%",
            width: "100%",
            borderRadius: "4px",
            zIndex: -1,
            backgroundColor: "white",
            boxSizing: "border-box",
          },
          "&:checked:after": {
            border: `2px solid ${color("brand")}`,
          },
        },
        body: {
          alignItems: "center",
        },
        labelWrapper: {
          paddingBottom: "2px",
        },
      }),
    },
  },
});

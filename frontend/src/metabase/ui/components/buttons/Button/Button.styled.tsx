import { getStylesRef, rem } from "@mantine/core";
import type {
  ButtonStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";

export const getButtonOverrides = (): MantineThemeOverride["components"] => ({
  Button: {
    defaultProps: {
      loaderProps: {
        size: "1rem",
        color: "currentColor",
      },
    },
    styles: (theme: MantineTheme, { compact }: ButtonStylesParams) => {
      return {
        root: {
          height: "auto",
          padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
          fontSize: theme.fontSizes.md,
          lineHeight: "1rem",
          [`&:has(.${getStylesRef("label")}:empty)`]: {
            padding: compact ? `${rem(3)} ${rem(3)}` : `${rem(11)} ${rem(11)}`,
            [`.${getStylesRef("leftIcon")}`]: {
              marginRight: 0,
            },
            [`.${getStylesRef("rightIcon")}`]: {
              marginLeft: 0,
            },
          },
        },
        label: {
          ref: getStylesRef("label"),
        },
        leftIcon: {
          ref: getStylesRef("leftIcon"),
          marginRight: theme.spacing.sm,
        },
        rightIcon: {
          ref: getStylesRef("rightIcon"),
          marginLeft: theme.spacing.sm,
        },
      };
    },
    variants: {
      default: theme => ({
        root: {
          color: theme.colors.text[2],
          borderColor: theme.colors.border[0],
          backgroundColor: theme.white,
          "&:hover": {
            color: theme.colors.brand[1],
            backgroundColor: theme.colors.bg[0],
          },
          "&:disabled": {
            color: theme.colors.text[0],
            borderColor: theme.colors.border[0],
            backgroundColor: theme.colors.bg[0],
          },
          "&[data-loading]": {
            [`& .${getStylesRef("leftIcon")}`]: {
              color: theme.colors.brand[1],
            },
          },
        },
      }),
      filled: theme => ({
        root: {
          color: theme.white,
          borderColor: theme.colors.brand[1],
          backgroundColor: theme.colors.brand[1],
          "&:hover": {
            borderColor: getHoverColor(theme),
            backgroundColor: getHoverColor(theme),
          },
          "&:disabled": {
            color: theme.colors.text[0],
            borderColor: theme.colors.border[0],
            backgroundColor: theme.colors.bg[0],
          },
          "&[data-loading]": {
            [`& .${getStylesRef("leftIcon")}`]: {
              color: theme.colors.focus[0],
            },
          },
        },
      }),
      outline: theme => ({
        root: {
          color: theme.colors.brand[1],
          borderColor: theme.colors.brand[1],
          "&:hover": {
            color: getHoverColor(theme),
            borderColor: getHoverColor(theme),
            backgroundColor: theme.colors.brand[0],
          },
          "&:disabled": {
            color: theme.colors.text[0],
            borderColor: theme.colors.border[0],
            backgroundColor: theme.colors.bg[0],
          },
        },
      }),
      subtle: theme => ({
        root: {
          color: theme.colors.brand[1],
          "&:hover": {
            color: getHoverColor(theme),
            backgroundColor: "transparent",
          },
          "&:disabled": {
            color: theme.colors.text[0],
            borderColor: "transparent",
            backgroundColor: "transparent",
          },
        },
      }),
    },
  },
});

const getHoverColor = (theme: MantineTheme) => {
  return theme.fn.rgba(theme.colors.brand[1], 0.88);
};

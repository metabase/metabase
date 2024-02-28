import type {
  ButtonStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getStylesRef, rem } from "@mantine/core";

import type { ExtraButtonProps } from ".";

export const getButtonOverrides = (): MantineThemeOverride["components"] => ({
  Button: {
    defaultProps: {
      color: "brand",
      variant: "default",
      loaderProps: {
        size: "1rem",
        color: "currentColor",
      },
    },
    styles: (
      theme: MantineTheme,
      { compact, animate }: ButtonStylesParams & ExtraButtonProps,
    ) => {
      return {
        root: {
          height: "auto",
          padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
          fontSize: theme.fontSizes.md,
          lineHeight: theme.lineHeight,
          overflow: "hidden",
          [`&:has(.${getStylesRef("label")}:empty)`]: {
            padding: compact ? `${rem(3)} ${rem(3)}` : `${rem(11)} ${rem(11)}`,
            [`.${getStylesRef("leftIcon")}`]: {
              marginRight: 0,
            },
            [`.${getStylesRef("rightIcon")}`]: {
              marginLeft: 0,
            },
          },
          "&:active": animate ? "" : { transform: "none" },
        },
        label: {
          ref: getStylesRef("label"),
          display: "inline-block",
          height: "auto",
          textOverflow: "ellipsis",
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
      default: (theme, { color }: ButtonStylesParams) => {
        const primaryColor = getPrimaryColor(theme, color);

        return {
          root: {
            color: theme.fn.themeColor("text-dark"),
            borderColor: theme.fn.themeColor("border"),
            backgroundColor: theme.white,
            "&:hover": {
              color: primaryColor,
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
            "&:disabled": {
              color: theme.fn.themeColor("text-light"),
              borderColor: theme.fn.themeColor("border"),
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
            "&[data-loading]": {
              [`& .${getStylesRef("leftIcon")}`]: {
                color: primaryColor,
              },
            },
          },
        };
      },
      filled: (theme, { color }: ButtonStylesParams) => {
        const primaryColor = getPrimaryColor(theme, color);
        const hoverColor = getHoverColor(theme, primaryColor);

        return {
          root: {
            color: theme.white,
            borderColor: primaryColor,
            backgroundColor: primaryColor,
            "&:hover": {
              borderColor: hoverColor,
              backgroundColor: hoverColor,
            },
            "&:disabled": {
              color: theme.fn.themeColor("text-light"),
              borderColor: theme.fn.themeColor("border"),
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
            "&[data-loading]": {
              [`& .${getStylesRef("leftIcon")}`]: {
                color: theme.fn.themeColor("focus"),
              },
            },
          },
        };
      },
      outline: (theme, { color }: ButtonStylesParams) => {
        const primaryColor = getPrimaryColor(theme, color);
        const hoverColor = getHoverColor(theme, primaryColor);
        const backgroundColor = getBackgroundColor(theme, primaryColor);

        return {
          root: {
            color: primaryColor,
            borderColor: primaryColor,
            "&:hover": {
              color: hoverColor,
              borderColor: hoverColor,
              backgroundColor,
            },
            "&:disabled": {
              color: theme.fn.themeColor("text-light"),
              borderColor: theme.fn.themeColor("border"),
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
          },
        };
      },
      white: theme => {
        const primaryColor = theme.fn.themeColor("text-dark");
        const hoverColor = theme.fn.themeColor("text-dark");
        const backgroundColor = theme.white;

        return {
          root: {
            color: primaryColor,
            borderColor: backgroundColor,
            backgroundColor: backgroundColor,
            "&:hover": {
              color: hoverColor,
              borderColor: hoverColor,
              backgroundColor,
            },
            "&:disabled": {
              color: theme.fn.themeColor("text-light"),
              borderColor: theme.fn.themeColor("border"),
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
          },
        };
      },
      subtle: (theme, { color }: ButtonStylesParams) => {
        const primaryColor = getPrimaryColor(theme, color);
        const hoverColor = getHoverColor(theme, primaryColor);

        return {
          root: {
            color: primaryColor,
            "&:hover": {
              color: hoverColor,
              backgroundColor: "transparent",
            },
            "&:disabled": {
              color: theme.fn.themeColor("text-light"),
              borderColor: "transparent",
              backgroundColor: "transparent",
            },
          },
        };
      },
    },
  },
});

const getPrimaryColor = (theme: MantineTheme, colorName: string) => {
  return theme.fn.themeColor(colorName, theme.fn.primaryShade());
};

const getHoverColor = (theme: MantineTheme, primaryColor: string) => {
  return theme.fn.rgba(primaryColor, 0.88);
};

const getBackgroundColor = (theme: MantineTheme, primaryColor: string) => {
  return theme.fn.rgba(primaryColor, 0.0971);
};

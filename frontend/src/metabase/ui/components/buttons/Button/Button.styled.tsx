import type {
  ButtonStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getStylesRef, rem } from "@mantine/core";

export const getButtonOverrides = (): MantineThemeOverride["components"] => ({
  Button: {
    defaultProps: {
      color: "brand.1",
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
          lineHeight: theme.lineHeight,
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
      default: (theme, { color }: ButtonStylesParams) => {
        const primaryColor = getPrimaryColor(theme, color);

        return {
          root: {
            color: theme.colors.text[2],
            borderColor: theme.colors.border[0],
            backgroundColor: theme.white,
            "&:hover": {
              color: primaryColor,
              backgroundColor: theme.colors.bg[0],
            },
            "&:disabled": {
              color: theme.colors.text[0],
              borderColor: theme.colors.border[0],
              backgroundColor: theme.colors.bg[0],
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
              color: theme.colors.text[0],
              borderColor: theme.colors.border[0],
              backgroundColor: theme.colors.bg[0],
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
              color: theme.colors.text[0],
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
  return theme.fn.themeColor(colorName, 0);
};

const getHoverColor = (theme: MantineTheme, primaryColor: string) => {
  return theme.fn.rgba(primaryColor, 0.88);
};

const getBackgroundColor = (theme: MantineTheme, primaryColor: string) => {
  return theme.fn.rgba(primaryColor, 0.598);
};

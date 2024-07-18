import type {
  ButtonStylesParams,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { getStylesRef, rem } from "@mantine/core";

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
    styles: (theme: MantineTheme, { compact }: ButtonStylesParams) => {
      return {
        root: {
          height: "auto",
          padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
          fontSize: theme.fontSizes.md,
          lineHeight: theme.lineHeight,
          overflow: "hidden",
          ":active": { transform: "none" }, // Remove Mantine's default pressed effect
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
            backgroundColor: theme.fn.themeColor("bg-white"),
            "&:hover": {
              color: primaryColor,
              backgroundColor: theme.fn.themeColor("bg-light"),
            },
            "&:disabled": {
              color: "var(--mb-color-text-tertiary)",
              borderColor: "var(--mb-color-border)",
              backgroundColor: "var(--mb-color-background-disabled)",
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
            borderColor: "var(--mb-color-background-brand)",
            backgroundColor: "var(--mb-color-background-brand)",
            "&:hover": {
              borderColor: hoverColor,
              backgroundColor: hoverColor,
            },
            "&:disabled": {
              color: "var(--mb-color-text-tertiary)",
              borderColor: "var(--mb-color-border)",
              backgroundColor: "var(--mb-color-background-disabled)",
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
              color: "var(--mb-color-text-tertiary)",
              borderColor: "var(--mb-color-border)",
              backgroundColor: "var(--mb-color-background-disabled)",
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
            "&:disabled, &[data-disabled=true]": {
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

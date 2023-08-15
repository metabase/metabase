import { getStylesRef, rem } from "@mantine/core";
import type {
  ButtonStylesParams,
  ContextStylesParams,
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
    styles: (
      theme: MantineTheme,
      { compact }: ButtonStylesParams,
      { variant }: ContextStylesParams,
    ) => {
      const styles = getButtonVariantStyles(theme, variant);

      return {
        root: {
          height: "auto",
          padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
          fontSize: theme.fontSizes.md,
          lineHeight: "1rem",
          color: styles.color,
          borderColor: styles.borderColor,
          "&[data-loading]": {
            "&::before": {
              backgroundColor: styles.loadingBackgroundColor,
            },

            [`& .${getStylesRef("leftIcon")}`]: {
              color: styles.loaderColor,
            },
          },
          "&:hover": {
            color: styles.hoverColor,
            borderColor: styles.hoverBorderColor,
            backgroundColor: styles.hoverBackgroundColor,
          },
          [`&:has(.${getStylesRef("label")}:empty)`]: {
            padding: compact ? `${rem(7)} ${rem(7)}` : `${rem(11)} ${rem(11)}`,
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
  },
});

const getButtonVariantStyles = (theme: MantineTheme, variant?: string) => {
  switch (variant) {
    case "filled":
      return {
        color: theme.white,
        borderColor: theme.fn.primaryColor(),
        backgroundColor: theme.fn.primaryColor(),
        loaderColor: theme.colors.focus[0],
        hoverBorderColor: theme.fn.lighten(theme.fn.primaryColor(), 0.12),
        hoverBackgroundColor: theme.fn.lighten(theme.fn.primaryColor(), 0.12),
      };
    case "outline":
      return {
        color: theme.fn.primaryColor(),
        borderColor: theme.fn.primaryColor(),
        loaderColor: theme.fn.primaryColor(),
        hoverColor: theme.fn.lighten(theme.fn.primaryColor(), 0.12),
        hoverBorderColor: theme.fn.lighten(theme.fn.primaryColor(), 0.12),
        hoverBackgroundColor: theme.colors.brand[0],
      };
    case "subtle":
      return {
        color: theme.fn.primaryColor(),
        loaderColor: theme.fn.primaryColor(),
        hoverColor: theme.fn.lighten(theme.fn.primaryColor(), 0.12),
        hoverBackgroundColor: "transparent",
        loadingBackgroundColor: "transparent",
      };
    default:
      return {
        color: theme.colors.text[2],
        borderColor: theme.colors.border[0],
        backgroundColor: theme.white,
        loaderColor: theme.fn.primaryColor(),
        hoverColor: theme.fn.primaryColor(),
        hoverBackgroundColor: theme.colors.bg[0],
      };
  }
};

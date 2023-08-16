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

          "&:disabled": {
            color: styles.disabledColor,
            borderColor: styles.disabledBorderColor,
            backgroundColor: styles.disabledBackgroundColor,
          },
          "&[data-loading]": {
            [`& .${getStylesRef("icon")}`]: {
              color: styles.loaderColor,
            },
          },
          "&:hover": {
            color: styles.hoverColor,
            borderColor: styles.hoverBorderColor,
            backgroundColor: styles.hoverBackgroundColor,
          },
          [`&:has(.${getStylesRef("label")}:empty)`]: {
            padding: compact ? `${rem(3)} ${rem(3)}` : `${rem(11)} ${rem(11)}`,

            [`.${getStylesRef("icon")}`]: {
              marginLeft: 0,
              marginRight: 0,
            },
          },
        },
        label: {
          ref: getStylesRef("label"),
        },
        icon: {
          ref: getStylesRef("icon"),
        },
        leftIcon: {
          marginRight: theme.spacing.sm,
        },
        rightIcon: {
          marginLeft: theme.spacing.sm,
        },
      };
    },
  },
});

const getButtonVariantStyles = (theme: MantineTheme, variant?: string) => {
  const hoverColor = theme.fn.rgba(theme.fn.primaryColor(), 0.88);

  switch (variant) {
    case "filled":
      return {
        color: theme.white,
        borderColor: theme.fn.primaryColor(),
        backgroundColor: theme.fn.primaryColor(),
        loaderColor: theme.colors.brand[1],
        hoverBorderColor: hoverColor,
        hoverBackgroundColor: hoverColor,
        disabledColor: theme.colors.text[0],
        disabledBorderColor: theme.colors.border[0],
        disabledBackgroundColor: theme.colors.bg[0],
      };
    case "outline":
      return {
        color: theme.fn.primaryColor(),
        borderColor: theme.fn.primaryColor(),
        loaderColor: theme.fn.primaryColor(),
        hoverColor: hoverColor,
        hoverBorderColor: hoverColor,
        hoverBackgroundColor: theme.colors.brand[0],
        disabledColor: theme.colors.text[0],
        disabledBorderColor: theme.colors.border[0],
        disabledBackgroundColor: theme.colors.bg[0],
      };
    case "subtle":
      return {
        color: theme.fn.primaryColor(),
        loaderColor: theme.fn.primaryColor(),
        hoverColor: hoverColor,
        hoverBackgroundColor: "transparent",
        disabledColor: theme.colors.text[0],
        disabledBorderColor: "transparent",
        disabledBackgroundColor: "transparent",
      };
    default:
      return {
        color: theme.colors.text[2],
        borderColor: theme.colors.border[0],
        backgroundColor: theme.white,
        loaderColor: theme.fn.primaryColor(),
        hoverColor: theme.fn.primaryColor(),
        hoverBackgroundColor: theme.colors.bg[0],
        disabledColor: theme.colors.text[0],
        disabledBorderColor: theme.colors.border[0],
        disabledBackgroundColor: theme.colors.bg[0],
      };
  }
};

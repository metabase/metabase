import { rem } from "@mantine/core";
import type {
  ButtonStylesParams,
  ContextStylesParams,
  MantineTheme,
} from "@mantine/core";

export const getButtonOverrides = () => ({
  Button: {
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
          "&:hover": {
            color: styles.hoverColor,
            backgroundColor: styles.hoverBackgroundColor,
          },
        },
        rightIcon: {
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
      };
    case "outline":
      return {
        color: theme.fn.primaryColor(),
        borderColor: theme.fn.primaryColor(),
        hoverBackgroundColor: theme.colors.brand[0],
      };
    case "subtle":
      return {
        color: theme.fn.primaryColor(),
        hoverBackgroundColor: "transparent",
      };
    default:
      return {
        color: theme.colors.text[2],
        borderColor: theme.colors.border[0],
        backgroundColor: theme.white,
        hoverColor: theme.fn.primaryColor(),
        hoverBackgroundColor: theme.colors.bg[0],
      };
  }
};

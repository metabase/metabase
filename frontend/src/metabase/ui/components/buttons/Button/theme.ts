import { rem } from "@mantine/core";
import type { MantineTheme, ContextStylesParams } from "@mantine/core";

export const getButtonOverrides = () => ({
  Button: {
    styles: (
      theme: MantineTheme,
      params: unknown,
      context: ContextStylesParams,
    ) => {
      const styles = getButtonVariantStyles(theme, context);

      return {
        root: {
          height: "auto",
          padding: `${rem(11)} ${rem(15)}`,
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

const getButtonVariantStyles = (
  theme: MantineTheme,
  { variant }: ContextStylesParams,
) => {
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

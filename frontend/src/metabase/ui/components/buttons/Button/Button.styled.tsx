import type {
  ButtonProps,
  MantineTheme,
  MantineThemeOverride,
} from "@mantine/core";
import { rem } from "@mantine/core";

import type { ExtraButtonProps } from ".";

function getStylesRef(refName: string) {
  return `___ref-${refName || ""}`;
}

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
      { compact, animate, color }: ButtonProps & ExtraButtonProps,
    ) => {
      console.log(theme);
      const primaryColor = `var(--mantine-color-${color}-0)`;
      const hoverColor = `rgba(from var(--mantine-color-${color}-0) r g b / 0.88)`;
      const backgroundColor = `rgba(from var(--mantine-color-${color}-0) r g b / 0.0971)`;
      return {
        root: {
          height: "auto",
          padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
          fontSize: theme.fontSizes.md,
          lineHeight: theme.lineHeights.md,
          overflow: "hidden",
          [`&:has(.${getStylesRef("label")}:empty)`]: {
            padding: compact ? `${rem(3)} ${rem(3)}` : `${rem(11)} ${rem(11)}`,
            [`.${getStylesRef("section")}[data-position="left"]`]: {
              marginRight: 0,
            },
            [`.${getStylesRef("rightSection")}[data-position="right"]`]: {
              marginLeft: 0,
            },
          },
          "&[data-variant=default]": {
            color: "var(--mantine-color-text-dark-0)",
            borderColor: "var(--mantine-color-border-0)",
            backgroundColor: "var(--mantine-color-bg-white-0)",
            "&:hover": {
              color: primaryColor,
              backgroundColor: "var(--mantine-color-bg-light-0)",
            },
            "&:disabled": {
              color: "var(--mantine-color-text-light-0)",
              borderColor: "var(--mantine-color-border-0)",
              backgroundColor: "var(--mantine-color-bg-light-0)",
            },
            "&[data-loading]": {
              [`& .${getStylesRef("section")}[data-position="left"]`]: {
                color: primaryColor,
              },
            },
          },
          "&[data-variant=filled]": {
            color: theme.white,
            borderColor: primaryColor,
            backgroundColor: primaryColor,
            "&:hover": {
              borderColor: hoverColor,
              backgroundColor: hoverColor,
            },
            "&:disabled": {
              color: "var(--mantine-color-text-light-0)",
              borderColor: "var(--mantine-color-border-0)",
              backgroundColor: "var(--mantine-color-bg-light-0)",
            },
            "&[data-loading]": {
              [`& .${getStylesRef("section")}[data-position="left"]`]: {
                color: "var(--mantine-color-focus-0)",
              },
            },
          },
          "&[data-variant=outline]": {
            color: primaryColor,
            borderColor: primaryColor,
            "&:hover": {
              color: hoverColor,
              borderColor: hoverColor,
              backgroundColor,
            },
            "&:disabled": {
              color: "var(--mantine-color-text-light-0)",
              borderColor: "var(--mantine-color-border-0)",
              backgroundColor: "var(--mantine-color-bg-light-0)",
            },
          },
          "&[data-variant=subtle]": {
            color: primaryColor,
            "&:hover": {
              color: hoverColor,
              backgroundColor: "transparent",
            },
            "&:disabled": {
              color: "var(--mantine-color-text-light-0)",
              borderColor: "transparent",
              backgroundColor: "transparent",
            },
          },
        },
        label: {
          ref: getStylesRef("label"),
          display: "inline-block",
          height: "auto",
          textOverflow: "ellipsis",
        },
        section: {
          ref: getStylesRef("section"),
          "&[data-position=left]": {
            marginRight: theme.spacing.sm,
          },
          "&[data-position=right]": {
            marginLeft: theme.spacing.sm,
          },
        },
      };
    },
    // variants: {
    //   default: (theme, { color }: ButtonProps) => {
    //     const primaryColor = getPrimaryColor(theme, color);

    //     return {
    //       root: {},
    //     };
    //   },
    //   filled: (theme, { color }: ButtonProps) => {
    //     const primaryColor = getPrimaryColor(theme, color);
    //     const hoverColor = getHoverColor(theme, primaryColor);

    //     return {
    //       root: {
    //         color: theme.white,
    //         borderColor: primaryColor,
    //         backgroundColor: primaryColor,
    //         "&:hover": {
    //           borderColor: hoverColor,
    //           backgroundColor: hoverColor,
    //         },
    //         "&:disabled": {
    //           color: theme.fn.themeColor("text-light"),
    //           borderColor: theme.fn.themeColor("border"),
    //           backgroundColor: theme.fn.themeColor("bg-light"),
    //         },
    //         "&[data-loading]": {
    //           [`& .${getStylesRef("leftIcon")}`]: {
    //             color: theme.fn.themeColor("focus"),
    //           },
    //         },
    //       },
    //     };
    //   },
    //   outline: (theme, { color }: ButtonProps) => {
    //     const primaryColor = getPrimaryColor(theme, color);
    //     const hoverColor = getHoverColor(theme, primaryColor);
    //     const backgroundColor = getBackgroundColor(theme, primaryColor);

    //     return {
    //       root: {
    //         color: primaryColor,
    //         borderColor: primaryColor,
    //         "&:hover": {
    //           color: hoverColor,
    //           borderColor: hoverColor,
    //           backgroundColor,
    //         },
    //         "&:disabled": {
    //           color: theme.fn.themeColor("text-light"),
    //           borderColor: theme.fn.themeColor("border"),
    //           backgroundColor: theme.fn.themeColor("bg-light"),
    //         },
    //       },
    //     };
    //   },
    //   subtle: (theme, { color }: ButtonProps) => {
    //     const primaryColor = getPrimaryColor(theme, color);
    //     const hoverColor = getHoverColor(theme, primaryColor);
    //     return {
    //       root: {
    //         color: primaryColor,
    //         "&:hover": {
    //           color: hoverColor,
    //           backgroundColor: "transparent",
    //         },
    //         "&:disabled": {
    //           color: theme.fn.themeColor("text-light"),
    //           borderColor: "transparent",
    //           backgroundColor: "transparent",
    //         },
    //       },
    //     };
    //   },
    // },
  },
});

// const getPrimaryColor = (theme: MantineTheme, colorName: string) => {
//   return theme.fn.themeColor(colorName, theme.fn.primaryShade());
// };

// const getHoverColor = (theme: MantineTheme, primaryColor: string) => {
//   return theme.fn.rgba(primaryColor, 0.88);
// };

// const getBackgroundColor = (theme: MantineTheme, primaryColor: string) => {
//   return theme.fn.rgba(primaryColor, 0.0971);
// };

import { Button, rem } from "@mantine/core";

import ButtonStyles from "./Button.module.css";

export const buttonOverrides = {
  Button: Button.extend({
    defaultProps: {
      color: "var(--mb-color-brand)",
      variant: "default",
      size: "md",
      loaderProps: {
        size: "1rem",
        color: "currentColor",
      },
    },
    classNames: {
      root: ButtonStyles.root,
      label: ButtonStyles.label,
    },
    vars: () => {
      return {
        root: {
          "--button-padding-x": rem(15),
        },
      };
    },

    // styles: (theme: MantineTheme, { compact }: ButtonStylesParams) => {
    //   return {
    //     root: {
    //       padding: compact ? `${rem(3)} ${rem(7)}` : `${rem(11)} ${rem(15)}`,
    //       [`&:has(.${getStylesRef("label")}:empty)`]: {
    //         padding: compact ? `${rem(3)} ${rem(3)}` : `${rem(11)} ${rem(11)}`,
    //         [`.${getStylesRef("leftIcon")}`]: {
    //           marginRight: 0,
    //         },
    //         [`.${getStylesRef("rightIcon")}`]: {
    //           marginLeft: 0,
    //         },
    //       },
    //     },
    //   };
  }),
};
//     variants: {
//       default: (theme, { color }: ButtonStylesParams) => {
//         const primaryColor = getPrimaryColor(theme, color);

//         return {
//           root: {
//             color: theme.fn.themeColor("text-dark"),
//             borderColor: theme.fn.themeColor("border"),
//             backgroundColor: theme.fn.themeColor("bg-white"),
//             "&:hover": {
//               color: primaryColor,
//               backgroundColor: theme.fn.themeColor("bg-light"),
//             },
//             "&:disabled": {
//               color: "var(--mb-color-text-tertiary)",
//               borderColor: "var(--mb-color-border)",
//               backgroundColor: "var(--mb-color-background-disabled)",
//             },
//             "&[data-loading]": {
//               [`& .${getStylesRef("leftIcon")}`]: {
//                 color: primaryColor,
//               },
//             },
//           },
//         };
//       },
//       filled: (theme, { color }: ButtonStylesParams) => {
//         const primaryColor = getPrimaryColor(theme, color);
//         const hoverColor = getHoverColor(theme, primaryColor);
//         const isThemeable = color === "brand";
//         const colors = isThemeable
//           ? {
//               default: "var(--mb-color-background-brand)",
//               hover:
//                 "color-mix(in srgb, var(--mb-color-background-brand) 88%, transparent)",
//             }
//           : {
//               default: primaryColor,
//               hover: hoverColor,
//             };

//         return {
//           root: {
//             color: theme.white,
//             borderColor: colors.default,
//             backgroundColor: colors.default,
//             "&:hover": {
//               borderColor: colors.hover,
//               backgroundColor: colors.hover,
//             },
//             "&:disabled": {
//               color: "var(--mb-color-text-tertiary)",
//               borderColor: "var(--mb-color-border)",
//               backgroundColor: "var(--mb-color-background-disabled)",
//             },
//             "&[data-loading]": {
//               [`& .${getStylesRef("leftIcon")}`]: {
//                 color: theme.fn.themeColor("focus"),
//               },
//             },
//           },
//         };
//       },
//       outline: (theme, { color }: ButtonStylesParams) => {
//         const primaryColor = getPrimaryColor(theme, color);
//         const hoverColor = getHoverColor(theme, primaryColor);
//         const backgroundColor = getBackgroundColor(theme, primaryColor);

//         return {
//           root: {
//             color: primaryColor,
//             borderColor: primaryColor,
//             "&:hover": {
//               color: hoverColor,
//               borderColor: hoverColor,
//               backgroundColor,
//             },
//             "&:disabled": {
//               color: "var(--mb-color-text-tertiary)",
//               borderColor: "var(--mb-color-border)",
//               backgroundColor: "var(--mb-color-background-disabled)",
//             },
//           },
//         };
//       },
//       subtle: (theme, { color }: ButtonStylesParams) => {
//         const primaryColor = getPrimaryColor(theme, color);
//         const hoverColor = getHoverColor(theme, primaryColor);
//         return {
//           root: {
//             color: primaryColor,
//             "&:hover": {
//               color: hoverColor,
//               backgroundColor: "transparent",
//             },
//             "&:disabled, &[data-disabled=true]": {
//               color: theme.fn.themeColor("text-light"),
//               borderColor: "transparent",
//               backgroundColor: "transparent",
//             },
//           },
//         };
//       },
//     },
//   },
// });

// const getPrimaryColor = (theme: MantineTheme, colorName: string) => {
//   return theme.fn.themeColor(colorName, theme.fn.primaryShade());
// };

// const getHoverColor = (theme: MantineTheme, primaryColor: string) => {
//   return theme.fn.rgba(primaryColor, 0.88);
// };

// const getBackgroundColor = (theme: MantineTheme, primaryColor: string) => {
//   return theme.fn.rgba(primaryColor, 0.0971);
// };

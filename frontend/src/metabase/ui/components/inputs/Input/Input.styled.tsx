import { Input, InputWrapper, getSize, rem } from "@mantine/core";

import Styles from "./Input.module.css";

const SIZES = {
  xs: rem(32),
  md: rem(40),
};

const PADDING = 12;
const DEFAULT_ICON_WIDTH = 40;
const UNSTYLED_ICON_WIDTH = 28;
const BORDER_WIDTH = 1;

export const inputOverrides = {
  Input: Input.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      input: Styles.input,
      section: Styles.section,
    },
    vars: (
      theme,
      { size, radius, multiline, leftSection, rightSection, variant },
    ) => ({
      wrapper: {
        "--input-height": multiline
          ? "auto"
          : getSize({ size: size, sizes: SIZES }),
        "--input-min-height": getSize({ size: size, sizes: SIZES }),
        "--input-border-radius": radius ?? theme.radius.xs,
        "--input-padding-inline-start": leftSection
          ? rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH)
          : rem(PADDING - BORDER_WIDTH),
        "--input-padding-inline-end": rightSection
          ? rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH)
          : rem(PADDING - BORDER_WIDTH),
        "--input-right-section-width":
          variant === "unstyled"
            ? rem(UNSTYLED_ICON_WIDTH)
            : rem(DEFAULT_ICON_WIDTH),
        "--inset-inline-end": 0,
      },
    }),
  }),
  InputWrapper: InputWrapper.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "error", "input"],
    },
    classNames: {
      label: Styles.label,
      description: Styles.description,
      error: Styles.error,
      required: Styles.required,
    },
  }),
  InputLabel: Input.Label.extend({
    classNames: {
      label: Styles.label,
    },
    vars: (theme, { size }) => ({
      label: {
        "--input-label-size": getSize({ size, sizes: theme.fontSizes }),
      },
    }),
  }),
  // styles: (
  //   theme,
  //   { multiline, radius }: InputStylesParams,
  //   { size = "md" },
  // ) => ({
  //   input: {
  //     color: theme.fn.themeColor("text-dark"),
  //     borderRadius: radius ?? theme.radius.xs,
  //     height: multiline ? "auto" : getSize({ size, sizes: SIZES }),
  //     minHeight: getSize({ size, sizes: SIZES }),
  //     background: theme.fn.themeColor("bg-white"),
  //     "&::placeholder": {
  //       color: theme.fn.themeColor("text-light"),
  //     },
  //     "&:disabled": {
  //       backgroundColor: theme.fn.themeColor("bg-light"),
  //     },
  //     "&[data-invalid]": {
  //       color: theme.fn.themeColor("error"),
  //       borderColor: theme.fn.themeColor("error"),
  //       "&::placeholder": {
  //         color: theme.fn.themeColor("error"),
  //       },
  //     },
  //   },
  //   label: {
  //     color: theme.fn.themeColor("text-medium"),
  //     fontSize: getSize({ size, sizes: theme.fontSizes }),
  //     marginBottom: theme.spacing.xs,
  //   },
  //   icon: {
  //     color: theme.fn.themeColor("text-dark"),
  //   },
  //   rightSection: {
  //     color: theme.fn.themeColor("text-light"),
  //   },
  // }),
  // sizes: {
  //   xs: theme => ({
  //     input: {
  //       fontSize: theme.fontSizes.sm,
  //       lineHeight: theme.lineHeight,
  //     },
  //   }),
  //   md: theme => ({
  //     input: {
  //       fontSize: theme.fontSizes.md,
  //       lineHeight: rem(24),
  //     },
  //   }),
  // },

  //   variants: {
  //     default: (
  //       theme,
  //       { withRightSection, rightSectionWidth }: InputStylesParams,
  //     ) => ({
  //       input: {
  //         paddingLeft: rem(PADDING - BORDER_WIDTH),
  // paddingRight: withRightSection
  //   ? typeof rightSectionWidth === "number"
  //     ? rem(rightSectionWidth - BORDER_WIDTH)
  //     : `calc(${rightSectionWidth} - ${BORDER_WIDTH}px)`
  //   : rem(PADDING - BORDER_WIDTH),
  //         borderColor: theme.fn.themeColor("border"),
  //         "&:focus": {
  //           borderColor: theme.fn.themeColor("brand"),
  //         },
  //         "&[data-with-icon]": {
  //           paddingLeft: rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH),
  //         },
  //       },
  //       icon: {
  //         width: rem(DEFAULT_ICON_WIDTH),
  //       },
  //       rightSection: {
  //         width: rightSectionWidth ?? rem(DEFAULT_ICON_WIDTH),
  //       },
  //     }),
  //     unstyled: (
  //       theme,
  //       { withRightSection, rightSectionWidth }: InputStylesParams,
  //     ) => ({
  //       input: {
  //         paddingLeft: 0,
  //         paddingRight: withRightSection ? rightSectionWidth : 0,
  //         "&[data-with-icon]": {
  //           paddingLeft: rem(

  //           ),
  //         },
  //       },
  //       icon: {
  //         width: rem(UNSTYLED_ICON_WIDTH),
  //         justifyContent: "left",
  //       },
  //       rightSection: {
  //         width: rightSectionWidth ?? rem(UNSTYLED_ICON_WIDTH),
  //         justifyContent: "right",
  //       },
  //     }),
  //   },
  // }),
};

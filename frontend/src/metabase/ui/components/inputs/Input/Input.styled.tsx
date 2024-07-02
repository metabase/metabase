import type { InputStylesParams, MantineThemeOverride } from "@mantine/core";
import { getSize, rem } from "@mantine/core";

const SIZES = {
  xs: rem(32),
  md: rem(40),
};

const PADDING = 12;
const DEFAULT_ICON_WIDTH = 40;
const UNSTYLED_ICON_WIDTH = 28;
const BORDER_WIDTH = 1;

export const getInputOverrides = (): MantineThemeOverride["components"] => ({
  Input: {
    defaultProps: {
      size: "md",
    },
    styles: (theme, { multiline }: InputStylesParams, { size = "md" }) => ({
      input: {
        color: theme.fn.themeColor("text-dark"),
        borderRadius: theme.radius.xs,
        height: multiline ? "auto" : getSize({ size, sizes: SIZES }),
        minHeight: getSize({ size, sizes: SIZES }),
        background: theme.fn.themeColor("bg-white"),
        "&::placeholder": {
          color: theme.fn.themeColor("text-light"),
        },
        "&:disabled": {
          backgroundColor: theme.fn.themeColor("bg-light"),
        },
        "&[data-invalid]": {
          color: theme.fn.themeColor("error"),
          borderColor: theme.fn.themeColor("error"),
          "&::placeholder": {
            color: theme.fn.themeColor("error"),
          },
        },
      },
      label: {
        color: theme.fn.themeColor("text-medium"),
        fontSize: getSize({ size, sizes: theme.fontSizes }),
        marginBottom: theme.spacing.xs,
      },
      icon: {
        color: theme.fn.themeColor("text-dark"),
      },
      rightSection: {
        color: theme.fn.themeColor("text-light"),
      },
    }),
    sizes: {
      xs: theme => ({
        input: {
          fontSize: theme.fontSizes.sm,
          lineHeight: theme.lineHeight,
        },
      }),
      md: theme => ({
        input: {
          fontSize: theme.fontSizes.md,
          lineHeight: rem(24),
        },
      }),
    },
    variants: {
      default: (
        theme,
        { withRightSection, rightSectionWidth }: InputStylesParams,
      ) => ({
        input: {
          paddingLeft: rem(PADDING - BORDER_WIDTH),
          paddingRight: withRightSection
            ? typeof rightSectionWidth === "number"
              ? rem(rightSectionWidth - BORDER_WIDTH)
              : `calc(${rightSectionWidth} - ${BORDER_WIDTH}px)`
            : rem(PADDING - BORDER_WIDTH),
          borderColor: theme.fn.themeColor("border"),
          "&:focus": {
            borderColor: theme.fn.themeColor("brand"),
          },
          "&[data-with-icon]": {
            paddingLeft: rem(DEFAULT_ICON_WIDTH - BORDER_WIDTH),
          },
        },
        icon: {
          width: rem(DEFAULT_ICON_WIDTH),
        },
        rightSection: {
          width: rightSectionWidth ?? rem(DEFAULT_ICON_WIDTH),
        },
      }),
      unstyled: (
        theme,
        { withRightSection, rightSectionWidth }: InputStylesParams,
      ) => ({
        input: {
          paddingLeft: 0,
          paddingRight: withRightSection ? rightSectionWidth : 0,
          "&[data-with-icon]": {
            paddingLeft: rem(UNSTYLED_ICON_WIDTH),
          },
        },
        icon: {
          width: rem(UNSTYLED_ICON_WIDTH),
          justifyContent: "left",
        },
        rightSection: {
          width: rightSectionWidth ?? rem(UNSTYLED_ICON_WIDTH),
          justifyContent: "right",
        },
      }),
    },
  },
  InputWrapper: {
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "error", "input"],
    },
    styles: theme => ({
      label: {
        color: theme.fn.themeColor("text-dark"),
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,
      },
      description: {
        color: theme.fn.themeColor("text-dark"),
        fontSize: theme.fontSizes.xs,
        lineHeight: theme.lineHeight,
      },
      error: {
        color: theme.fn.themeColor("error"),
        fontSize: theme.fontSizes.xs,
        lineHeight: theme.lineHeight,
      },
      required: {
        color: theme.fn.themeColor("error"),
      },
    }),
  },
});

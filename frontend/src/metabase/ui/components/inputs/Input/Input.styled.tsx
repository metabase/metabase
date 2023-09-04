import { getSize, rem } from "@mantine/core";
import type { InputStylesParams, MantineThemeOverride } from "@mantine/core";

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
        color: theme.colors.text[2],
        borderRadius: theme.radius.xs,
        height: multiline ? "auto" : getSize({ size, sizes: SIZES }),
        minHeight: getSize({ size, sizes: SIZES }),
        "&::placeholder": {
          color: theme.colors.text[0],
        },
        "&:disabled": {
          backgroundColor: theme.colors.bg[0],
        },
        "&[data-invalid]": {
          color: theme.colors.error[0],
          borderColor: theme.colors.error[0],
          "&::placeholder": {
            color: theme.colors.error[0],
          },
        },
      },
      icon: {
        color: theme.colors.text[2],
      },
      rightSection: {
        color: theme.colors.text[0],
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
          borderColor: theme.colors.border[0],
          "&:focus": {
            borderColor: theme.colors.brand[1],
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
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.sm,
        fontWeight: "bold",
        lineHeight: theme.lineHeight,
      },
      description: {
        color: theme.colors.text[2],
        fontSize: theme.fontSizes.xs,
        lineHeight: theme.lineHeight,
      },
      error: {
        color: theme.colors.error[0],
        fontSize: theme.fontSizes.xs,
        lineHeight: theme.lineHeight,
      },
      required: {
        color: theme.colors.error[0],
      },
    }),
  },
});

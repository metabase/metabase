import type { MantineThemeOverride, SwitchStylesParams } from "@mantine/core";
import { rem, getSize, getStylesRef } from "@mantine/core";

import { color } from "metabase/lib/colors";

const LABEL_FONT_SIZES = {
  xs: rem(12),
  sm: rem(14),
  md: rem(16),
};

const LABEL_LINE_HEIGHT = {
  xs: rem(16),
  sm: rem(24),
  md: rem(24),
};

const SWITCH_PADDING = {
  xs: rem(8),
  sm: rem(8),
  md: rem(16),
};

const TRACK_HEIGHTS = {
  xs: rem(16),
  sm: rem(20),
  md: rem(24),
};

const TRACK_WIDTHS = {
  xs: rem(32),
  sm: rem(40),
  md: rem(48),
  lg: rem(64),
};

const THUMB_SIZES = {
  xs: rem(12),
  sm: rem(14),
  md: rem(18),
};

const TRACK_PADDING_TOP = {
  xs: rem(0),
  sm: rem(2),
  md: rem(0),
};

export const getSwitchOverrides = (): MantineThemeOverride["components"] => ({
  Switch: {
    defaultProps: {
      color: "brand",
      size: "md",
    },
    styles: (
      theme,
      { error, labelPosition }: SwitchStylesParams,
      { size = "md" },
    ) => {
      return {
        labelWrapper: {
          [labelPosition === "left" ? "paddingRight" : "paddingLeft"]: getSize({
            size,
            sizes: SWITCH_PADDING,
          }),
          "&:empty": {
            padding: 0,
          },
        },
        label: {
          padding: 0,
          fontWeight: 700,
          fontSize: getSize({ size, sizes: LABEL_FONT_SIZES }),
          lineHeight: getSize({ size, sizes: LABEL_LINE_HEIGHT }),
          color: theme.colors.text[2],
          cursor: "pointer",
          "&[data-disabled]": {
            color: theme.colors.text[0],
            cursor: "default",
          },
        },
        description: {
          padding: 0,
          marginTop: rem(8),
          fontSize: rem(12),
          color: theme.colors.text[1],
        },
        error: {
          padding: 0,
          marginTop: rem(8),
          fontSize: rem(12),
          color: theme.colors.error[0],
        },
        track: {
          backgroundColor: theme.colors.bg[1],
          border: error ? `1px solid ${color("accent3")}` : "none",
          boxSizing: "border-box",
          borderRadius: rem(24),
          height: getSize({ size, sizes: TRACK_HEIGHTS }),
          width: getSize({ size, sizes: TRACK_WIDTHS }),
          cursor: "pointer",
          [`${getStylesRef("input")}:disabled + &`]: {
            backgroundColor: theme.colors.bg[1],
          },
          marginTop: getSize({ size, sizes: TRACK_PADDING_TOP }),
        },
        thumb: {
          backgroundColor: theme.white,
          border: "none",
          borderRadius: rem(22),
          height: getSize({ size, sizes: THUMB_SIZES }),
          width: getSize({ size, sizes: THUMB_SIZES }),
          [`${getStylesRef("input")}:disabled + * > &`]: {
            backgroundColor: theme.colors.bg[0],
          },
        },
      };
    },
    variants: {
      stretch: () => ({
        body: {
          display: "flex",
          justifyContent: "space-between",
        },
      }),
    },
  },
});

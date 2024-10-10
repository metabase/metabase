import { Switch, getSize, rem } from "@mantine/core";

import SwitchStyles from "./Switch.module.css";

const LABEL_FONT_SIZES: Record<string, string> = {
  xs: rem(12),
  sm: rem(14),
  md: rem(16),
};

const LABEL_LINE_HEIGHT: Record<string, string> = {
  xs: rem(16),
  sm: rem(24),
  md: rem(24),
};

const SWITCH_PADDING: Record<string, string> = {
  xs: rem(8),
  sm: rem(8),
  md: rem(16),
};

const TRACK_HEIGHTS: Record<string, string> = {
  xs: rem(16),
  sm: rem(20),
  md: rem(24),
};

const TRACK_WIDTHS: Record<string, string> = {
  xs: rem(32),
  sm: rem(40),
  md: rem(48),
  lg: rem(64),
};

const THUMB_SIZES: Record<string, string> = {
  xs: rem(12),
  sm: rem(14),
  md: rem(18),
};

const TRACK_PADDING_TOP: Record<string, string> = {
  xs: rem(0),
  sm: rem(2),
  md: rem(0),
};

export const switchOverrides = {
  Switch: Switch.extend({
    defaultProps: {
      color: "brand",
      size: "md",
    },
    classNames: {
      root: SwitchStyles.root,
      labelWrapper: SwitchStyles.labelWrapper,
      label: SwitchStyles.label,
      description: SwitchStyles.description,
      error: SwitchStyles.error,
      track: SwitchStyles.track,
      thumb: SwitchStyles.thumb,
      body: SwitchStyles.body,
    },

    vars: (_theme, { size = "md" }) => {
      return {
        root: {
          "--switch-padding": getSize(SWITCH_PADDING[size]),
          "--switch-label-font-size": getSize(LABEL_FONT_SIZES[size]),
          "--label-lh": getSize(LABEL_LINE_HEIGHT[size]),
          "--switch-height": getSize(TRACK_HEIGHTS[size]),
          "--switch-width": getSize(TRACK_WIDTHS[size]),
          "--switch-thumb-size": getSize(THUMB_SIZES[size]),
          "--track-padding-top": getSize(TRACK_PADDING_TOP[size]),
          "--switch-radius": rem(24),
          "--label-offset-end": 0,
          "--label-offset-start": 0,
        },
      };
    },
  }),
};

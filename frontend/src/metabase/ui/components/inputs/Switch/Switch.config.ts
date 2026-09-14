import { Switch, rem } from "@mantine/core";

import SwitchStyles from "./Switch.module.css";

const TRACK_WIDTH = rem(32);
const TRACK_HEIGHT = rem(16);
const THUMB_SIZE = rem(12);

export const switchOverrides = {
  Switch: Switch.extend({
    defaultProps: {
      size: "xs",
      withThumbIndicator: false,
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

    vars: () => ({
      root: {
        "--switch-width": TRACK_WIDTH,
        "--switch-height": TRACK_HEIGHT,
        "--switch-thumb-size": THUMB_SIZE,
        "--switch-radius": "var(--mantine-radius-sm)",
      },
    }),
  }),
};

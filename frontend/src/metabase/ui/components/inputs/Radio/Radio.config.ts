import { Radio, getSize, rem } from "@mantine/core";

import RadioStyles from "./Radio.module.css";

const SIZES: Record<string, string> = {
  md: rem(20),
};

export const radioOverrides = {
  Radio: Radio.extend({
    defaultProps: {
      size: "md",
    },
    classNames: {
      root: RadioStyles.root,
      radio: RadioStyles.radio,
      label: RadioStyles.label,
      labelWrapper: RadioStyles.labelWrapper,
      description: RadioStyles.description,
      icon: RadioStyles.icon,
    },
    vars: (_theme, { size = "md" }) => ({
      root: {
        "--radio-size": getSize(SIZES[size]),
      },
    }),
  }),
  RadioIndicator: Radio.Indicator.extend({
    classNames: {
      // indicator is visually same as Radio so it needs the same styles
      indicator: RadioStyles.radio,
    },
  }),
};

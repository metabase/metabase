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
      description: RadioStyles.description,
      icon: RadioStyles.icon,
    },
    vars: (_theme, { size = "md" }) => ({
      root: {
        "--radio-size": getSize(SIZES[size]),
      },
    }),
  }),
};

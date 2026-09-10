import { Radio, RadioCard, RadioIndicator, rem } from "@mantine/core";

import RadioStyles from "./Radio.module.css";

const RADIO_SIZE = rem(16);
const ICON_SIZE = rem(6);

export const radioOverrides = {
  Radio: Radio.extend({
    defaultProps: {
      radius: "sm",
    },
    classNames: {
      root: RadioStyles.root,
      body: RadioStyles.body,
      inner: RadioStyles.inner,
      radio: RadioStyles.radio,
      icon: RadioStyles.icon,
      label: RadioStyles.label,
      labelWrapper: RadioStyles.labelWrapper,
      description: RadioStyles.description,
      error: RadioStyles.error,
    },
    vars: () => ({
      root: {
        "--radio-size": RADIO_SIZE,
        "--radio-icon-size": ICON_SIZE,
        "--radio-icon-color": "var(--mb-color-text-primary-inverse)",
      },
    }),
  }),
  RadioCard: RadioCard.extend({
    defaultProps: {
      withBorder: false,
    },
    classNames: {
      card: RadioStyles.card,
    },
  }),
  RadioIndicator: RadioIndicator.extend({
    defaultProps: {
      radius: "sm",
    },
    classNames: {
      indicator: RadioStyles.cardIndicator,
      icon: RadioStyles.icon,
    },
    vars: () => ({
      indicator: {
        "--radio-size": RADIO_SIZE,
        "--radio-icon-size": ICON_SIZE,
      },
    }),
  }),
};

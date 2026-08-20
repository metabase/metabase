import { Radio, RadioCard, RadioIndicator, getSize, rem } from "@mantine/core";

import RadioStyles from "./Radio.module.css";

const SIZES: Record<string, string> = {
  sm: rem(16),
};

const ICON_SIZE = rem(6);

export const radioOverrides = {
  Radio: Radio.extend({
    defaultProps: {
      size: "sm",
      radius: "md",
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
    vars: (_theme, { size = "sm" }) => ({
      root: {
        "--radio-size": getSize(SIZES[size] ?? SIZES.sm),
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
      radius: "md",
      size: SIZES.sm,
    },
    classNames: {
      indicator: RadioStyles.cardIndicator,
      icon: RadioStyles.icon,
    },
    vars: () => ({
      indicator: {
        "--radio-icon-size": ICON_SIZE,
      },
    }),
  }),
};

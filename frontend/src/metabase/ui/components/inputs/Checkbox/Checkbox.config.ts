import {
  Checkbox,
  CheckboxCard,
  CheckboxIndicator,
  getSize,
  rem,
} from "@mantine/core";

import CheckboxStyles from "./Checkbox.module.css";
import { CheckboxIcon } from "./CheckboxIcon";

const SIZES: Record<string, string> = {
  xs: rem(16),
  sm: rem(16),
  md: rem(20),
};

export const checkboxOverrides = {
  Checkbox: Checkbox.extend({
    defaultProps: {
      icon: CheckboxIcon,
      size: "sm",
      radius: "xs",
    },
    classNames: {
      root: CheckboxStyles.root,
      body: CheckboxStyles.body,
      input: CheckboxStyles.input,
      icon: CheckboxStyles.icon,
      label: CheckboxStyles.label,
      labelWrapper: CheckboxStyles.labelWrapper,
      description: CheckboxStyles.description,
      inner: CheckboxStyles.inner,
      error: CheckboxStyles.error,
    },
    vars: (_theme, { size }) => {
      return {
        root: {
          "--checkbox-size": getSize(SIZES[size || "md"]),
        },
      };
    },
  }),
  CheckboxCard: CheckboxCard.extend({
    defaultProps: {
      withBorder: false,
    },
    classNames: {
      card: CheckboxStyles.card,
    },
  }),
  CheckboxIndicator: CheckboxIndicator.extend({
    defaultProps: {
      icon: CheckboxIcon,
      radius: "xs",
    },
    classNames: {
      indicator: CheckboxStyles.cardIndicator,
      icon: CheckboxStyles.icon,
    },
  }),
};

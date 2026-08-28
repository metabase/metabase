import { Checkbox, CheckboxCard, CheckboxIndicator, rem } from "@mantine/core";

import CheckboxStyles from "./Checkbox.module.css";
import { CheckboxIcon } from "./CheckboxIcon";

const CHECKBOX_SIZE = rem(16);

export const checkboxOverrides = {
  Checkbox: Checkbox.extend({
    defaultProps: {
      icon: CheckboxIcon,
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
    vars: () => ({
      root: {
        "--checkbox-size": CHECKBOX_SIZE,
      },
    }),
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
      size: CHECKBOX_SIZE,
    },
    classNames: {
      indicator: CheckboxStyles.cardIndicator,
      icon: CheckboxStyles.icon,
    },
  }),
};

import { Checkbox, getSize, rem } from "@mantine/core";

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
      size: "md",
    },
    classNames: {
      root: CheckboxStyles.root,
      body: CheckboxStyles.body,
      input: CheckboxStyles.input,
      icon: CheckboxStyles.icon,
      label: CheckboxStyles.label,
      description: CheckboxStyles.description,
      inner: CheckboxStyles.inner,
    },
    vars: (_theme, { size }) => {
      return {
        root: {
          "--checkbox-radius": "0.25rem",
          "--checkbox-size": getSize(SIZES[size || "md"]),
        },
      };
    },
  }),
};

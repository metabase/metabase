import { Button } from "@mantine/core";

import ButtonStyles from "./Button.module.css";

export const buttonOverrides = {
  Button: Button.extend({
    defaultProps: {
      color: "var(--mb-color-brand)",
      variant: "default",
      size: "md",
      loaderProps: {
        size: "1rem",
        color: "currentColor",
      },
    },
    classNames: {
      root: ButtonStyles.root,
      label: ButtonStyles.label,
    },
  }),
};

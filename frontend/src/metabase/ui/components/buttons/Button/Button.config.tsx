import type { ButtonFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import ButtonStyles from "./Button.module.css";

export const buttonOverrides = {
  Button: themeComponent<ButtonFactory>({
    defaultProps: {
      color: "core-brand",
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
      inner: ButtonStyles.inner,
    },
  }),
};

import type { PasswordInputFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import Styles from "./PasswordInput.module.css";

export const passwordInputOverrides = {
  PasswordInput: themeComponent<PasswordInputFactory>({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
    },
    classNames: {
      input: Styles.input,
      innerInput: Styles.innerInput,
      error: Styles.error,
    },
  }),
};

import { PasswordInput } from "@mantine/core";

import Styles from "./PasswordInput.module.css";

export const passwordInputOverrides = {
  PasswordInput: PasswordInput.extend({
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

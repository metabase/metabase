import { TextInput } from "@mantine/core";

import Styles from "./TextInput.module.css";

export const textInputOverrides = {
  TextInput: TextInput.extend({
    defaultProps: {
      size: "md",
      inputWrapperOrder: ["label", "description", "input", "error"],
      errorProps: {
        role: "alert",
      },
    },
    classNames: {
      input: Styles.input,
      error: Styles.error,
    },
  }),
};
